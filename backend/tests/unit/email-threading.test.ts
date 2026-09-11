import { describe, it, expect } from 'vitest';
import {
  normalizeReplySubject,
  buildReferencesHeader,
  isSystemEmailAddress,
} from '../../src/modules/conversations/conversation.service.js';
import {
  startEmailConversationSchema,
} from '../../src/modules/conversations/conversation.schemas.js';
import { LeadCategory } from '@prisma/client';

describe('Email Threading & Outbound Helpers', () => {
  describe('normalizeReplySubject', () => {
    it('should prefix subject with Re: if missing', () => {
      expect(normalizeReplySubject('Consultation enquiry')).toBe('Re: Consultation enquiry');
      expect(normalizeReplySubject('Investment Opportunity')).toBe('Re: Investment Opportunity');
    });

    it('should not duplicate Re: if already present case-insensitively', () => {
      expect(normalizeReplySubject('Re: Consultation enquiry')).toBe('Re: Consultation enquiry');
      expect(normalizeReplySubject('re: Consultation enquiry')).toBe('re: Consultation enquiry');
      expect(normalizeReplySubject('RE:   Consultation enquiry')).toBe('RE:   Consultation enquiry');
    });

    it('should fall back to default when empty or null', () => {
      expect(normalizeReplySubject(null)).toBe('Re: FranklyEdu Global CRM');
      expect(normalizeReplySubject('')).toBe('Re: FranklyEdu Global CRM');
      expect(normalizeReplySubject('   ')).toBe('Re: FranklyEdu Global CRM');
    });
  });

  describe('buildReferencesHeader', () => {
    it('should append parentMessageId to existing references without duplicating', () => {
      const existing = '<msg-1@example.com> <msg-2@example.com>';
      const parent = '<msg-3@example.com>';
      expect(buildReferencesHeader(existing, parent)).toBe(
        '<msg-1@example.com> <msg-2@example.com> <msg-3@example.com>',
      );
    });

    it('should not duplicate parentMessageId if already in references', () => {
      const existing = '<msg-1@example.com> <msg-2@example.com>';
      const parent = '<msg-2@example.com>';
      expect(buildReferencesHeader(existing, parent)).toBe(
        '<msg-1@example.com> <msg-2@example.com>',
      );
    });

    it('should return parentMessageId when existing references is empty', () => {
      expect(buildReferencesHeader(null, '<msg-1@example.com>')).toBe('<msg-1@example.com>');
      expect(buildReferencesHeader('', '<msg-1@example.com>')).toBe('<msg-1@example.com>');
    });

    it('should return existing references when parentMessageId is empty', () => {
      expect(buildReferencesHeader('<msg-1@example.com>', null)).toBe('<msg-1@example.com>');
      expect(buildReferencesHeader('<msg-1@example.com>', '')).toBe('<msg-1@example.com>');
    });

    it('should return undefined when both are empty', () => {
      expect(buildReferencesHeader(null, null)).toBeUndefined();
      expect(buildReferencesHeader('', '')).toBeUndefined();
    });
  });

  describe('isSystemEmailAddress', () => {
    it('should identify system addresses case-insensitively', () => {
      expect(isSystemEmailAddress('emmanuel@frankedu-global.com')).toBe(true);
      expect(isSystemEmailAddress('EMMANUEL@FRANKEDU-GLOBAL.COM')).toBe(true);
      expect(isSystemEmailAddress('frankly@huejoraata.resend.app')).toBe(true);
      expect(isSystemEmailAddress('  frankly@huejoraata.resend.app  ')).toBe(true);
    });

    it('should allow normal external customer addresses', () => {
      expect(isSystemEmailAddress('client@gmail.com')).toBe(false);
      expect(isSystemEmailAddress('investor@company.co.uk')).toBe(false);
    });
  });

  describe('startEmailConversationSchema', () => {
    it('should validate valid new email conversation payload', () => {
      const payload = {
        to: 'prospect@example.com',
        recipientName: 'Dr. Jane Smith',
        subject: 'Cyprus Golden Visa Opportunities',
        body: 'Dear Dr. Smith, following up on your request...',
        leadCategory: LeadCategory.PROPERTY_BUYER_INVESTOR,
        idempotencyKey: 'idem_valid_12345678',
      };

      const result = startEmailConversationSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.to).toBe('prospect@example.com');
        expect(result.data.subject).toBe('Cyprus Golden Visa Opportunities');
      }
    });

    it('should reject invalid recipient email address', () => {
      const payload = {
        to: 'not-an-email',
        subject: 'Hello',
        body: 'Message body',
      };

      const result = startEmailConversationSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject empty subject or body', () => {
      expect(
        startEmailConversationSchema.safeParse({
          to: 'test@example.com',
          subject: '',
          body: 'Content',
        }).success,
      ).toBe(false);

      expect(
        startEmailConversationSchema.safeParse({
          to: 'test@example.com',
          subject: 'Valid subject',
          body: '',
        }).success,
      ).toBe(false);
    });

    it('should reject subject longer than 200 characters', () => {
      const longSubject = 'A'.repeat(201);
      const result = startEmailConversationSchema.safeParse({
        to: 'test@example.com',
        subject: longSubject,
        body: 'Content',
      });
      expect(result.success).toBe(false);
    });
  });
});
