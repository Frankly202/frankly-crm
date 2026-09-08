import { describe, it, expect } from 'vitest';
import {
  createContactSchema,
  updateContactSchema,
} from '../../src/modules/contacts/contact.schemas.js';

describe('Contact Validation Schemas', () => {
  it('should accept contact with email', () => {
    const result = createContactSchema.safeParse({
      name: 'John Doe',
      primaryEmail: 'john@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should accept contact with phone only', () => {
    const result = createContactSchema.safeParse({
      name: 'Maria Callas',
      primaryPhone: '+35799123456',
    });
    expect(result.success).toBe(true);
  });

  it('should accept contact with Instagram handle only', () => {
    const result = createContactSchema.safeParse({
      name: 'Alex IG',
      instagramHandle: '@alex_property',
    });
    expect(result.success).toBe(true);
  });

  it('should reject contact creation when none of email, phone, or instagram are provided', () => {
    const result = createContactSchema.safeParse({
      name: 'No Identifier Person',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('At least one contact identifier');
    }
  });

  it('should allow partial updates in updateContactSchema', () => {
    const result = updateContactSchema.safeParse({
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });
});
