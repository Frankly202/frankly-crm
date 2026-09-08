import { describe, it, expect } from 'vitest';
import {
  createLeadSchema,
  updateLeadStatusSchema,
  leadQuerySchema,
} from '../../src/modules/leads/lead.schemas.js';
import { LeadCategory, LeadStatus } from '@prisma/client';

describe('Lead Validation Schemas', () => {
  const validUUID = '123e4567-e89b-12d3-a456-426614174000';

  it('should accept valid lead creation for all 5 business categories', () => {
    const categories = [
      LeadCategory.PROPERTY_BUYER_INVESTOR,
      LeadCategory.PROPERTY_SELLER_AGENT,
      LeadCategory.STUDY_ABROAD_STUDENT,
      LeadCategory.UNIVERSITY_EDUCATION_PARTNER,
      LeadCategory.OTHER_BUSINESS,
    ];

    for (const category of categories) {
      const result = createLeadSchema.safeParse({
        title: `Test Lead for ${category}`,
        category,
        contactId: validUUID,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(LeadStatus.NEW); // default status
      }
    }
  });

  it('should reject invalid lead category', () => {
    const result = createLeadSchema.safeParse({
      title: 'Invalid Category Lead',
      category: 'NON_EXISTENT_CATEGORY',
      contactId: validUUID,
    });
    expect(result.success).toBe(false);
  });

  it('should validate status update schema', () => {
    const valid = updateLeadStatusSchema.safeParse({
      status: LeadStatus.QUALIFIED,
      note: 'Client confirmed budget and timeframe',
    });
    expect(valid.success).toBe(true);

    const invalid = updateLeadStatusSchema.safeParse({
      status: 'INVALID_STATUS',
    });
    expect(invalid.success).toBe(false);
  });

  it('should transform string query boolean for hasPendingNextAction', () => {
    const parsedTrue = leadQuerySchema.safeParse({
      hasPendingNextAction: 'true',
    });
    expect(parsedTrue.success).toBe(true);
    if (parsedTrue.success) {
      expect(parsedTrue.data.hasPendingNextAction).toBe(true);
    }

    const parsedFalse = leadQuerySchema.safeParse({
      hasPendingNextAction: 'false',
    });
    expect(parsedFalse.success).toBe(true);
    if (parsedFalse.success) {
      expect(parsedFalse.data.hasPendingNextAction).toBe(false);
    }
  });
});
