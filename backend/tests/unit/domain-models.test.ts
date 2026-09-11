import { describe, it, expect } from 'vitest';
import {
  Role,
  LeadCategory,
  LeadStatus,
  ChannelType,
  MessageDirection,
  MessageStatus,
  ActivityType,
} from '@prisma/client';

describe('Domain Models & Enums Specification', () => {
  it('should have strictly approved User roles', () => {
    expect(Role.ADMIN).toBe('ADMIN');
    expect(Role.AGENT).toBe('AGENT');
    expect(Object.keys(Role)).toEqual(['ADMIN', 'AGENT']);
  });

  it('should support exactly the 5 approved business lead categories', () => {
    const expectedCategories = [
      'PROPERTY_BUYER_INVESTOR',
      'PROPERTY_SELLER_AGENT',
      'STUDY_ABROAD_STUDENT',
      'UNIVERSITY_EDUCATION_PARTNER',
      'OTHER_BUSINESS',
    ];
    expect(Object.keys(LeadCategory).sort()).toEqual(expectedCategories.sort());
  });

  it('should support the core lead lifecycle statuses', () => {
    const expectedStatuses = ['NEW', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'LOST', 'CLOSED_WON'];
    expect(Object.keys(LeadStatus).sort()).toEqual(expectedStatuses.sort());
  });

  it('should support all 4 MVP channel providers', () => {
    const expectedChannels = ['WHATSAPP', 'INSTAGRAM', 'RESEND_EMAIL', 'WEBSITE_FORM'];
    expect(Object.keys(ChannelType).sort()).toEqual(expectedChannels.sort());
  });

  it('should support message directions and delivery statuses', () => {
    expect(Object.keys(MessageDirection).sort()).toEqual(['INBOUND', 'OUTBOUND'].sort());
    expect(Object.keys(MessageStatus).sort()).toEqual(
      ['PENDING', 'RECEIVED', 'SENT', 'DELIVERED', 'FAILED'].sort(),
    );
  });

  it('should support expected activity audit log types', () => {
    const expectedActivities = [
      'LEAD_CREATED',
      'STATUS_CHANGED',
      'NOTE_ADDED',
      'NEXT_ACTION_SET',
      'MESSAGE_SENT',
      'MESSAGE_RECEIVED',
      'LEAD_ASSIGNED',
    ];
    expect(Object.keys(ActivityType).sort()).toEqual(expectedActivities.sort());
  });
});
