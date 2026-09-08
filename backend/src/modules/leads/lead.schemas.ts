import { z } from 'zod';
import { LeadCategory, LeadStatus, ChannelType, ActivityType } from '@prisma/client';

export const createLeadSchema = z.object({
  title: z.string().min(1, 'Lead title is required').trim(),
  category: z.nativeEnum(LeadCategory),
  status: z.nativeEnum(LeadStatus).optional().default(LeadStatus.NEW),
  contactId: z.string().uuid('Valid contact ID is required'),
  assignedToUserId: z.string().uuid('Valid user ID is required').optional().nullable(),
  sourceChannel: z.nativeEnum(ChannelType).optional().default(ChannelType.WEBSITE_FORM),
  notes: z.string().trim().optional().nullable(),
  nextActionRequired: z.string().trim().optional().nullable(),
  nextActionDueDate: z.coerce.date().optional().nullable(),
});

export const updateLeadSchema = z.object({
  title: z.string().min(1, 'Lead title cannot be empty').trim().optional(),
  category: z.nativeEnum(LeadCategory).optional(),
  notes: z.string().trim().optional().nullable(),
  sourceChannel: z.nativeEnum(ChannelType).optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  nextActionRequired: z.string().trim().optional().nullable(),
  nextActionDueDate: z.coerce.date().optional().nullable(),
});

export const updateLeadStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
  note: z.string().trim().optional(),
});

export const assignLeadSchema = z.object({
  assignedToUserId: z.string().uuid().nullable(),
});

export const createActivitySchema = z.object({
  type: z.nativeEnum(ActivityType).optional().default(ActivityType.NOTE_ADDED),
  description: z.string().min(1, 'Description is required').trim(),
  metadata: z.record(z.unknown()).optional(),
});

export const leadQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  category: z.nativeEnum(LeadCategory).optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  assignedToUserId: z.string().optional(),
  sourceChannel: z.nativeEnum(ChannelType).optional(),
  search: z.string().trim().optional(),
  hasPendingNextAction: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type LeadQueryInput = z.infer<typeof leadQuerySchema>;
