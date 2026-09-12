import { prisma } from '../../config/database.js';
import {
  ChannelType,
  LeadStatus,
  LeadCategory,
  MessageDirection,
  MessageStatus,
  ActivityType,
  Prisma,
  Contact,
  Lead,
  Conversation,
  Message,
} from '@prisma/client';
import { NormalizedInboundMessage } from './adapters/channel-adapter.interface.js';
import { logger } from '../../common/utils/logger.js';
import { normalizeEmail, normalizePhone } from '../../common/utils/identifier.util.js';

export interface IngestResult {
  message: Message;
  conversation: Conversation;
  contact: Contact;
  lead: Lead;
  deduplicated?: boolean;
}

export class WebhookService {
  /**
   * Deterministic resolution of an open lead for a contact.
   */
  private async resolveOpenLead(
    tx: Prisma.TransactionClient,
    contactId: string,
    conversationLeadId: string | null,
    suggestedCategory?: LeadCategory,
  ): Promise<Lead | null> {
    // 1. If conversation already has an active linked lead, prioritize it
    if (conversationLeadId) {
      const linkedLead = await tx.lead.findUnique({
        where: { id: conversationLeadId },
      });
      if (
        linkedLead &&
        linkedLead.status !== LeadStatus.CLOSED_WON &&
        linkedLead.status !== LeadStatus.LOST
      ) {
        return linkedLead;
      }
    }

    // 2. If suggestedCategory is provided, match open lead in that category deterministically
    if (suggestedCategory) {
      const matchingCategoryLead = await tx.lead.findFirst({
        where: {
          contactId,
          category: suggestedCategory,
          status: { notIn: [LeadStatus.CLOSED_WON, LeadStatus.LOST] },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      });
      if (matchingCategoryLead) {
        return matchingCategoryLead;
      }
    }

    // 3. Otherwise, select the most recently updated open lead with deterministic tie-breakers
    return tx.lead.findFirst({
      where: {
        contactId,
        status: { notIn: [LeadStatus.CLOSED_WON, LeadStatus.LOST] },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  /**
   * Race-safe contact resolution by phone, email, or Instagram handle.
   */
  private async resolveOrCreateContact(
    tx: Prisma.TransactionClient,
    inbound: NormalizedInboundMessage,
  ): Promise<Contact> {
    let contact: Contact | null = null;

    if (inbound.channel === ChannelType.WHATSAPP) {
      contact = await tx.contact.findUnique({
        where: { primaryPhone: inbound.senderIdentifier },
      });
    } else if (inbound.channel === ChannelType.INSTAGRAM) {
      contact = await tx.contact.findUnique({
        where: { instagramHandle: inbound.senderIdentifier },
      });
    } else if (inbound.channel === ChannelType.RESEND_EMAIL) {
      contact = await tx.contact.findUnique({
        where: { primaryEmail: inbound.senderIdentifier },
      });
    } else if (inbound.channel === ChannelType.WEBSITE_FORM) {
      const raw = (inbound.rawPayload || {}) as { email?: string; phone?: string };
      const email = raw.email
        ? normalizeEmail(raw.email)
        : inbound.senderIdentifier.includes('@')
          ? inbound.senderIdentifier
          : null;
      const phone = raw.phone
        ? normalizePhone(raw.phone)
        : !inbound.senderIdentifier.includes('@')
          ? inbound.senderIdentifier
          : null;

      if (email) {
        contact = await tx.contact.findUnique({
          where: { primaryEmail: email },
        });
      }
      if (!contact && phone) {
        contact = await tx.contact.findUnique({
          where: { primaryPhone: phone },
        });
      }
    }

    if (contact) {
      return contact;
    }

    // Create new contact with race-condition safety
    try {
      const contactData: Prisma.ContactCreateInput = {
        name: inbound.senderName || inbound.senderIdentifier,
        primaryPhone: inbound.channel === ChannelType.WHATSAPP ? inbound.senderIdentifier : null,
        instagramHandle: inbound.channel === ChannelType.INSTAGRAM ? inbound.senderIdentifier : null,
        primaryEmail: inbound.channel === ChannelType.RESEND_EMAIL ? inbound.senderIdentifier : null,
      };

      if (inbound.channel === ChannelType.WEBSITE_FORM) {
        const raw = (inbound.rawPayload || {}) as { email?: string; phone?: string };
        if (raw.email) {
          contactData.primaryEmail = normalizeEmail(raw.email);
        } else if (inbound.senderIdentifier.includes('@')) {
          contactData.primaryEmail = inbound.senderIdentifier;
        }

        if (raw.phone) {
          contactData.primaryPhone = normalizePhone(raw.phone);
        } else if (!inbound.senderIdentifier.includes('@')) {
          contactData.primaryPhone = inbound.senderIdentifier;
        }
      }

      contact = await tx.contact.create({
        data: contactData,
      });

      return contact;
    } catch (error) {
      // P2002: Unique constraint violation in concurrent race condition
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Re-query the contact created concurrently
        if (inbound.channel === ChannelType.WHATSAPP) {
          contact = await tx.contact.findUnique({ where: { primaryPhone: inbound.senderIdentifier } });
        } else if (inbound.channel === ChannelType.INSTAGRAM) {
          contact = await tx.contact.findUnique({ where: { instagramHandle: inbound.senderIdentifier } });
        } else if (inbound.channel === ChannelType.RESEND_EMAIL) {
          contact = await tx.contact.findUnique({ where: { primaryEmail: inbound.senderIdentifier } });
        } else {
          contact = await tx.contact.findFirst({
            where: {
              OR: [
                { primaryEmail: inbound.senderIdentifier },
                { primaryPhone: inbound.senderIdentifier },
              ],
            },
          });
        }
        if (contact) return contact;
      }
      throw error;
    }
  }

  /**
   * Process a normalized inbound message through the full ingestion pipeline.
   */
  async ingestInboundMessage(inbound: NormalizedInboundMessage): Promise<IngestResult> {
    // 1. Idempotency / Deduplication Check
    const existingMessage = await prisma.message.findUnique({
      where: { externalMessageId: inbound.externalMessageId },
      include: {
        conversation: {
          include: {
            contact: true,
            lead: true,
          },
        },
      },
    });

    if (existingMessage) {
      logger.info(
        `Duplicate message ignored (externalMessageId: ${inbound.externalMessageId})`,
      );
      return {
        message: existingMessage,
        conversation: existingMessage.conversation,
        contact: existingMessage.conversation.contact,
        lead: existingMessage.conversation.lead as Lead,
        deduplicated: true,
      };
    }

    // 2. Transactional multi-write pipeline
    try {
      return await prisma.$transaction(async (tx) => {
        // 2a. Resolve or Create Contact
        const contact = await this.resolveOrCreateContact(tx, inbound);

        // 2b. Resolve or Create Conversation Thread
        let conversation = await tx.conversation.findFirst({
          where: {
            contactId: contact.id,
            channel: inbound.channel,
          },
        });

        // 2c. Deterministic Lead Resolution
        let lead = await this.resolveOpenLead(
          tx,
          contact.id,
          conversation?.leadId ?? null,
          inbound.suggestedCategory,
        );

        if (!lead) {
          // Auto-create lead if no open lead exists
          lead = await tx.lead.create({
            data: {
              title: `Inbound ${inbound.channel} enquiry: ${contact.name}`,
              category: inbound.suggestedCategory || LeadCategory.OTHER_BUSINESS,
              status: LeadStatus.NEW,
              sourceChannel: inbound.channel,
              contactId: contact.id,
            },
          });

          await tx.activityLog.create({
            data: {
              leadId: lead.id,
              type: ActivityType.LEAD_CREATED,
              description: `Lead created from inbound ${inbound.channel} message`,
              metadata: {
                externalMessageId: inbound.externalMessageId,
                channel: inbound.channel,
              },
            },
          });
        } else if (lead.status === LeadStatus.CONTACTED) {
          // Auto-transition CONTACTED -> REPLIED on customer response
          lead = await tx.lead.update({
            where: { id: lead.id },
            data: { status: LeadStatus.REPLIED },
          });

          await tx.activityLog.create({
            data: {
              leadId: lead.id,
              type: ActivityType.STATUS_CHANGED,
              description: `Status changed from CONTACTED to REPLIED via inbound ${inbound.channel} message`,
              metadata: {
                previousStatus: LeadStatus.CONTACTED,
                newStatus: LeadStatus.REPLIED,
                externalMessageId: inbound.externalMessageId,
              },
            },
          });
        }

        // 2d. Update or Create Conversation
        if (!conversation) {
          conversation = await tx.conversation.create({
            data: {
              contactId: contact.id,
              leadId: lead.id,
              channel: inbound.channel,
              channelThreadId: inbound.senderIdentifier,
              lastMessageAt: inbound.timestamp,
            },
          });
        } else {
          conversation = await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              leadId: lead.id,
              lastMessageAt: inbound.timestamp,
            },
          });
        }

        // 2e. Persist Message
        const message = await tx.message.create({
          data: {
            conversationId: conversation.id,
            direction: MessageDirection.INBOUND,
            status: MessageStatus.RECEIVED,
            body: inbound.body,
            subject: inbound.subject,
            rfcMessageId: inbound.rfcMessageId,
            inReplyTo: inbound.inReplyTo,
            references: inbound.references,
            senderIdentifier: inbound.senderIdentifier,
            senderName: inbound.senderName,
            recipientIdentifier: inbound.recipientIdentifier,
            externalMessageId: inbound.externalMessageId,
            rawPayload: inbound.rawPayload as Prisma.InputJsonValue,
            createdAt: inbound.timestamp,
          },
        });

        // 2f. Log Activity for Inbound Message
        await tx.activityLog.create({
          data: {
            leadId: lead.id,
            type: ActivityType.MESSAGE_RECEIVED,
            description: `Received inbound message via ${inbound.channel}`,
            metadata: {
              conversationId: conversation.id,
              messageId: message.id,
              channel: inbound.channel,
              sender: inbound.senderIdentifier,
            },
          },
        });

        return {
          message,
          conversation,
          contact,
          lead,
          deduplicated: false,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const isExternalMessageIdConstraint =
          (Array.isArray(target) && target.includes('externalMessageId')) ||
          (typeof target === 'string' && target.includes('externalMessageId')) ||
          String(error.message).includes('externalMessageId');

        if (isExternalMessageIdConstraint) {
          logger.info(
            `Concurrent duplicate webhook resolved for externalMessageId: ${inbound.externalMessageId}`,
          );

          const existingMessage = await prisma.message.findUnique({
            where: { externalMessageId: inbound.externalMessageId },
            include: {
              conversation: {
                include: {
                  contact: true,
                  lead: true,
                },
              },
            },
          });

          if (existingMessage) {
            return {
              message: existingMessage,
              conversation: existingMessage.conversation,
              contact: existingMessage.conversation.contact,
              lead: existingMessage.conversation.lead as Lead,
              deduplicated: true,
            };
          }
        }
      }
      throw error;
    }
  }
}

export const webhookService = new WebhookService();
