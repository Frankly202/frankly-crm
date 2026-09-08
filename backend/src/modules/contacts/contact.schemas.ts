import { z } from 'zod';

export const createContactSchema = z
  .object({
    name: z.string().min(1, 'Name is required').trim(),
    primaryEmail: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.string().email('Invalid email address'))
      .optional()
      .or(z.literal('')),
    primaryPhone: z.string().min(5, 'Phone number must be at least 5 characters').trim().optional().or(z.literal('')),
    instagramHandle: z.string().trim().optional().or(z.literal('')),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => Boolean(data.primaryEmail || data.primaryPhone || data.instagramHandle),
    {
      message: 'At least one contact identifier (email, phone, or Instagram handle) is required',
      path: ['primaryEmail'],
    },
  );

export const updateContactSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').trim().optional(),
  primaryEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email('Invalid email address'))
    .optional()
    .or(z.literal('')),
  primaryPhone: z.string().min(5, 'Phone number must be at least 5 characters').trim().optional().or(z.literal('')),
  instagramHandle: z.string().trim().optional().or(z.literal('')),
  metadata: z.record(z.unknown()).optional(),
});

export const contactQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactQueryInput = z.infer<typeof contactQuerySchema>;
