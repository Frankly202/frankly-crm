import { prisma } from '../../config/database.js';
import { NotFoundError, BadRequestError } from '../../common/errors/app-error.js';
import {
  ConversationQueryInput,
  SendOutboundMessageInput,
} from './conversation.schemas.js';
import {
  parsePaginationParams,
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/utils/pagination.util.js';
import {
  MessageDirection,
  MessageStatus,
  ActivityType,
  Prisma,
  Role,
} from '@prisma/client';
import { getChannelAdapter } from '../webhooks/adapters/channel-registry.js';

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
      // Unread means lastReadAt is null or lastReadAt < lastMessageAt
      where.OR = [
        { lastReadAt: null },
        // Prisma comparison between two columns requires raw or filtering post-query
      ];
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
    if (conversation.contact.primaryPhone) {
      recipientIdentifier = conversation.contact.primaryPhone;
    } else if (conversation.contact.primaryEmail) {
      recipientIdentifier = conversation.contact.primaryEmail;
    } else if (conversation.contact.instagramHandle) {
      recipientIdentifier = conversation.contact.instagramHandle;
    } else if (conversation.channelThreadId) {
      recipientIdentifier = conversation.channelThreadId;
    }

    if (!recipientIdentifier) {
      throw new BadRequestError('Contact does not have an addressable identifier for this channel');
    }

    // Dispatch message via channel adapter
    const adapter = getChannelAdapter(conversation.channel);
    const deliveryResult = await adapter.sendOutboundMessage({
      conversationId,
      recipientIdentifier,
      body: input.body,
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
