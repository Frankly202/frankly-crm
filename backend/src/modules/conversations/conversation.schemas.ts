import { z } from 'zod';
import { ChannelType, LeadCategory } from '@prisma/client';

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
  subject: z.string().trim().optional(),
});

export const startEmailConversationSchema = z.object({
  to: z.string().email('Valid recipient email address is required').trim(),
  recipientName: z.string().trim().min(1).optional(),
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(200, 'Subject cannot exceed 200 characters')
    .trim(),
  body: z.string().min(1, 'Message body is required').trim(),
  leadCategory: z.nativeEnum(LeadCategory).optional(),
  idempotencyKey: z.string().trim().min(8).max(256).optional(),
});

export type ConversationQueryInput = z.infer<typeof conversationQuerySchema>;
export type SendOutboundMessageInput = z.infer<typeof sendOutboundMessageSchema>;
export type StartEmailConversationInput = z.infer<typeof startEmailConversationSchema>;
