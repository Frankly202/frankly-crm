import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { NotFoundError, BadRequestError } from '../../common/errors/app-error.js';
import {
  ConversationQueryInput,
  SendOutboundMessageInput,
  StartEmailConversationInput,
} from './conversation.schemas.js';
import {
  parsePaginationParams,
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/utils/pagination.util.js';
import { normalizeEmail } from '../../common/utils/identifier.util.js';
import { env } from '../../config/env.js';
import {
  MessageDirection,
  MessageStatus,
  ActivityType,
  ChannelType,
  LeadStatus,
  LeadCategory,
  Prisma,
  Role,
} from '@prisma/client';
import { getChannelAdapter } from '../webhooks/adapters/channel-registry.js';

export function normalizeReplySubject(subject?: string | null): string {
  const trimmed = subject?.trim();
  if (!trimmed) {
    return 'Re: FranklyEdu Global CRM';
  }
  return /^re:\s*/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export function buildReferencesHeader(
  existingReferences?: string | null,
  parentMessageId?: string | null,
): string | undefined {
  const refs: string[] = [];
  if (existingReferences?.trim()) {
    refs.push(...existingReferences.trim().split(/\s+/));
  }
  if (parentMessageId?.trim() && !refs.includes(parentMessageId.trim())) {
    refs.push(parentMessageId.trim());
  }
  return refs.length > 0 ? refs.join(' ') : undefined;
}

export function isSystemEmailAddress(email: string): boolean {
  const normalized = normalizeEmail(email);
  const systemAddresses = [
    'emmanuel@frankedu-global.com',
    'frankly@huejoraata.resend.app',
    normalizeEmail(env.EMAIL_FROM_ADDRESS || ''),
    normalizeEmail(env.EMAIL_REPLY_TO || ''),
  ].filter(Boolean);
  return systemAddresses.includes(normalized);
}

export interface PaginatedConversations {
  conversations: unknown[];
  meta: PaginationMeta;
}

export interface CurrentUserContext {
  id: string;
  role: Role;
  email?: string;
  name?: string;
}

export class ConversationService {
  /**
   * List unified inbox conversations with filters, search, and unread computation.
   */
  async listConversations(query: ConversationQueryInput): Promise<PaginatedConversations> {
    const { page, limit, skip, take } = parsePaginationParams(query);

    const where: Prisma.ConversationWhereInput = {};

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.contactId) {
      where.contactId = query.contactId;
    }

    if (query.leadId) {
      where.leadId = query.leadId;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { channelThreadId: { contains: search, mode: 'insensitive' } },
        { contact: { name: { contains: search, mode: 'insensitive' } } },
        { contact: { primaryEmail: { contains: search, mode: 'insensitive' } } },
        { contact: { primaryPhone: { contains: search } } },
        { contact: { instagramHandle: { contains: search, mode: 'insensitive' } } },
        { messages: { some: { body: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    if (query.unreadOnly) {
      // Unread means never read (lastReadAt is null) OR new message arrived after last read
      const unreadRecords = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "conversations"
        WHERE "lastReadAt" IS NULL OR "lastMessageAt" > "lastReadAt"
      `;
      where.id = { in: unreadRecords.map((r) => r.id) };
    }

    const [total, rawConversations] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        skip,
        take,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              primaryEmail: true,
              primaryPhone: true,
              instagramHandle: true,
            },
          },
          lead: {
            select: {
              id: true,
              title: true,
              category: true,
              status: true,
              assignedToUserId: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              direction: true,
              status: true,
              body: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    // Compute isUnread for each conversation
    const conversations = rawConversations
      .map((conv) => {
        const isUnread =
          !conv.lastReadAt || conv.lastMessageAt.getTime() > conv.lastReadAt.getTime();
        return {
          ...conv,
          latestMessage: conv.messages[0] || null,
          isUnread,
        };
      })
      .filter((conv) => (query.unreadOnly ? conv.isUnread : true));

    return {
      conversations,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /**
   * Get single conversation with full chronological message timeline.
   */
  async getConversationById(id: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        lead: {
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError(`Conversation with ID ${id} not found`);
    }

    const isUnread =
      !conversation.lastReadAt ||
      conversation.lastMessageAt.getTime() > conversation.lastReadAt.getTime();

    return {
      ...conversation,
      isUnread,
    };
  }

  /**
   * Send an outbound reply message to a conversation.
   */
  async sendOutboundMessage(
    conversationId: string,
    input: SendOutboundMessageInput,
    currentUser?: CurrentUserContext,
  ) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true, lead: true },
    });

    if (!conversation) {
      throw new NotFoundError(`Conversation with ID ${conversationId} not found`);
    }

    // Determine target recipient identifier based on channel
    let recipientIdentifier = '';
    if (conversation.channel === ChannelType.WHATSAPP) {
      recipientIdentifier = conversation.contact.primaryPhone || conversation.channelThreadId || '';
    } else if (conversation.channel === ChannelType.RESEND_EMAIL) {
      recipientIdentifier = conversation.contact.primaryEmail || conversation.channelThreadId || '';
    } else if (conversation.channel === ChannelType.INSTAGRAM) {
      recipientIdentifier =
        conversation.channelThreadId || conversation.contact.instagramHandle || '';
    } else {
      recipientIdentifier =
        conversation.channelThreadId ||
        conversation.contact.primaryPhone ||
        conversation.contact.primaryEmail ||
        '';
    }

    if (!recipientIdentifier) {
      throw new BadRequestError('Contact does not have an addressable identifier for this channel');
    }

    // For email conversations, establish RFC threading headers and subject
    let subject: string | undefined = input.subject?.trim();
    let inReplyTo: string | undefined;
    let references: string | undefined;

    if (conversation.channel === ChannelType.RESEND_EMAIL) {
      const latestInboundEmail = await prisma.message.findFirst({
        where: {
          conversationId,
          direction: MessageDirection.INBOUND,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!subject) {
        const latestWithSubject = latestInboundEmail?.subject
          ? latestInboundEmail
          : await prisma.message.findFirst({
              where: { conversationId, subject: { not: null } },
              orderBy: { createdAt: 'desc' },
            });
        subject = normalizeReplySubject(latestWithSubject?.subject);
      }

      if (latestInboundEmail?.rfcMessageId) {
        inReplyTo = latestInboundEmail.rfcMessageId;
        references = buildReferencesHeader(
          latestInboundEmail.references,
          latestInboundEmail.rfcMessageId,
        );
      }
    }

    // Dispatch message via channel adapter
    const adapter = getChannelAdapter(conversation.channel);
    const deliveryResult = await adapter.sendOutboundMessage({
      conversationId,
      recipientIdentifier,
      body: input.body,
      subject,
      inReplyTo,
      references,
    });

    // Transactionally persist message, update conversation, and log activity
    return prisma.$transaction(async (tx) => {
      const now = new Date();

      const message = await tx.message.create({
        data: {
          conversationId,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          body: input.body,
          subject,
          inReplyTo,
          references,
          senderIdentifier: currentUser?.email || 'FranklyEdu CRM',
          recipientIdentifier,
          externalMessageId: deliveryResult.externalMessageId,
          createdAt: deliveryResult.timestamp,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: deliveryResult.timestamp,
          lastReadAt: now,
        },
      });

      if (conversation.leadId) {
        await tx.activityLog.create({
          data: {
            leadId: conversation.leadId,
            userId: currentUser?.id ?? null,
            type: ActivityType.MESSAGE_SENT,
            description: `Sent outbound message via ${conversation.channel}`,
            metadata: {
              conversationId,
              messageId: message.id,
              channel: conversation.channel,
              recipient: recipientIdentifier,
            },
          },
        });
      }

      return message;
    });
  }

  /**
   * Start a new outbound email conversation.
   * Safe two-phase write: persists PENDING message in DB first, dispatches to Resend outside transaction,
   * then updates message status to SENT or FAILED.
   */
  async startEmailConversation(
    input: StartEmailConversationInput,
    currentUser?: CurrentUserContext,
  ) {
    const targetEmail = normalizeEmail(input.to);
    if (!targetEmail) {
      throw new BadRequestError('Valid recipient email address is required');
    }

    if (isSystemEmailAddress(targetEmail)) {
      throw new BadRequestError('Cannot send outbound email to the CRM system address');
    }

    const idempotencyKey = input.idempotencyKey?.trim() || `idem_${crypto.randomUUID()}`;

    // Idempotency check: if key already exists, return existing status
    const existingMessage = await prisma.message.findUnique({
      where: { idempotencyKey },
      include: { conversation: true },
    });

    if (existingMessage) {
      if (existingMessage.status === MessageStatus.SENT) {
        return {
          conversationId: existingMessage.conversationId,
          messageId: existingMessage.id,
          status: existingMessage.status,
          deduplicated: true,
        };
      }
      if (existingMessage.status === MessageStatus.PENDING) {
        const ageMs = Date.now() - existingMessage.createdAt.getTime();
        if (ageMs < 120_000) {
          return {
            conversationId: existingMessage.conversationId,
            messageId: existingMessage.id,
            status: existingMessage.status,
            deduplicated: true,
          };
        }
      }
    }

    // Phase 1: DB Transaction: Resolve contact, conversation, lead, and persist PENDING message
    const { conversation, lead, pendingMessage } = await prisma.$transaction(async (tx) => {
      let contact = await tx.contact.findUnique({
        where: { primaryEmail: targetEmail },
      });

      if (!contact) {
        contact = await tx.contact.create({
          data: {
            name: input.recipientName?.trim() || targetEmail,
            primaryEmail: targetEmail,
          },
        });
      }

      let conversation = await tx.conversation.findFirst({
        where: {
          contactId: contact.id,
          channel: ChannelType.RESEND_EMAIL,
        },
      });

      let lead = null;
      if (conversation?.leadId) {
        lead = await tx.lead.findUnique({
          where: { id: conversation.leadId },
        });
      }

      if (!lead) {
        lead = await tx.lead.findFirst({
          where: {
            contactId: contact.id,
            status: { in: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.REPLIED] },
          },
        });
      }

      if (!lead) {
        lead = await tx.lead.create({
          data: {
            title: `Outbound email enquiry: ${contact.name}`,
            category: input.leadCategory || LeadCategory.OTHER_BUSINESS,
            status: LeadStatus.CONTACTED,
            sourceChannel: ChannelType.RESEND_EMAIL,
            contactId: contact.id,
            assignedToUserId: currentUser?.id ?? null,
          },
        });

        await tx.activityLog.create({
          data: {
            leadId: lead.id,
            userId: currentUser?.id ?? null,
            type: ActivityType.LEAD_CREATED,
            description: `Lead created from outbound email conversation to ${targetEmail}`,
            metadata: {
              channel: ChannelType.RESEND_EMAIL,
              recipient: targetEmail,
            },
          },
        });
      } else if (lead.status === LeadStatus.NEW) {
        lead = await tx.lead.update({
          where: { id: lead.id },
          data: { status: LeadStatus.CONTACTED },
        });

        await tx.activityLog.create({
          data: {
            leadId: lead.id,
            userId: currentUser?.id ?? null,
            type: ActivityType.STATUS_CHANGED,
            description: `Status changed from NEW to CONTACTED via outbound email`,
            metadata: {
              previousStatus: LeadStatus.NEW,
              newStatus: LeadStatus.CONTACTED,
            },
          },
        });
      }

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            contactId: contact.id,
            leadId: lead.id,
            channel: ChannelType.RESEND_EMAIL,
            channelThreadId: targetEmail,
            lastMessageAt: new Date(),
            lastReadAt: new Date(),
          },
        });
      } else {
        conversation = await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            leadId: lead.id,
            lastMessageAt: new Date(),
            lastReadAt: new Date(),
          },
        });
      }

      const pendingMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.PENDING,
          body: input.body,
          subject: input.subject,
          idempotencyKey,
          senderIdentifier: currentUser?.email || 'FranklyEdu CRM',
          recipientIdentifier: targetEmail,
        },
      });

      return { contact, conversation, lead, pendingMessage };
    });

    // Phase 2: Dispatch message via Resend adapter outside transaction
    const adapter = getChannelAdapter(ChannelType.RESEND_EMAIL);
    try {
      const deliveryResult = await adapter.sendOutboundMessage({
        conversationId: conversation.id,
        recipientIdentifier: targetEmail,
        body: input.body,
        subject: input.subject,
        idempotencyKey,
      });

      const sentMessage = await prisma.$transaction(async (tx) => {
        const updatedMessage = await tx.message.update({
          where: { id: pendingMessage.id },
          data: {
            status: MessageStatus.SENT,
            externalMessageId: deliveryResult.externalMessageId,
            createdAt: deliveryResult.timestamp,
          },
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: deliveryResult.timestamp,
            lastReadAt: new Date(),
          },
        });

        if (lead) {
          await tx.activityLog.create({
            data: {
              leadId: lead.id,
              userId: currentUser?.id ?? null,
              type: ActivityType.MESSAGE_SENT,
              description: `Sent initial outbound email to ${targetEmail}`,
              metadata: {
                conversationId: conversation.id,
                messageId: updatedMessage.id,
                channel: ChannelType.RESEND_EMAIL,
                recipient: targetEmail,
              },
            },
          });
        }

        return updatedMessage;
      });

      return {
        conversationId: conversation.id,
        messageId: sentMessage.id,
        status: sentMessage.status,
        externalMessageId: sentMessage.externalMessageId,
      };
    } catch (sendError) {
      await prisma.message.update({
        where: { id: pendingMessage.id },
        data: {
          status: MessageStatus.FAILED,
        },
      });
      throw sendError;
    }
  }

  /**
   * Mark a conversation as read.
   */
  async markConversationAsRead(id: string) {
    const existing = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Conversation with ID ${id} not found`);
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        lastReadAt: new Date(),
      },
    });

    return {
      id: updated.id,
      lastReadAt: updated.lastReadAt,
      isUnread: false,
    };
  }
}

export const conversationService = new ConversationService();
