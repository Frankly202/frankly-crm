import { z } from 'zod';
import { ChannelType } from '@prisma/client';

export const conversationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  channel: z.nativeEnum(ChannelType).optional(),
  contactId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().trim().optional(),
});

export const sendOutboundMessageSchema = z.object({
  body: z.string().min(1, 'Message body is required').trim(),
});

export type ConversationQueryInput = z.infer<typeof conversationQuerySchema>;
export type SendOutboundMessageInput = z.infer<typeof sendOutboundMessageSchema>;
