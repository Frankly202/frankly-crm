import { describe, it, expect } from 'vitest';
import { ChannelType } from '@prisma/client';
import { whatsAppAdapter } from '../../src/modules/webhooks/adapters/whatsapp.adapter.js';

import deliveredFixture from '../../src/modules/webhooks/fixtures/whatsapp-status-delivered.fixture.json';
import readFixture from '../../src/modules/webhooks/fixtures/whatsapp-status-read.fixture.json';
import failedFixture from '../../src/modules/webhooks/fixtures/whatsapp-status-failed.fixture.json';
import inboundMessageFixture from '../../src/modules/webhooks/fixtures/whatsapp.fixture.json';

describe('WhatsApp Status Normalization Unit Tests', () => {
  it('should correctly normalize delivered status fixture', () => {
    const updates = whatsAppAdapter.normalizeStatusUpdates(deliveredFixture);
    expect(updates.length).toBe(1);

    const update = updates[0];
    expect(update).toBeDefined();
    expect(update?.channel).toBe(ChannelType.WHATSAPP);
    expect(update?.externalMessageId).toBe('wamid.STATUS_TEST_001');
    expect(update?.status).toBe('DELIVERED');
    expect(update?.rawStatus).toBe('delivered');
    expect(update?.recipientIdentifier).toBe('+35799881122');
    expect(update?.timestamp).toEqual(new Date(1725717600 * 1000));
    expect(update?.errorDetails).toBeUndefined();
  });

  it('should correctly normalize read status fixture', () => {
    const updates = whatsAppAdapter.normalizeStatusUpdates(readFixture);
    expect(updates.length).toBe(1);

    const update = updates[0];
    expect(update).toBeDefined();
    expect(update?.channel).toBe(ChannelType.WHATSAPP);
    expect(update?.externalMessageId).toBe('wamid.STATUS_TEST_001');
    expect(update?.status).toBe('DELIVERED');
    expect(update?.rawStatus).toBe('read');
    expect(update?.timestamp).toEqual(new Date(1725717720 * 1000));
  });

  it('should correctly normalize failed status fixture with error details', () => {
    const updates = whatsAppAdapter.normalizeStatusUpdates(failedFixture);
    expect(updates.length).toBe(1);

    const update = updates[0];
    expect(update).toBeDefined();
    expect(update?.channel).toBe(ChannelType.WHATSAPP);
    expect(update?.externalMessageId).toBe('wamid.STATUS_TEST_001');
    expect(update?.status).toBe('FAILED');
    expect(update?.rawStatus).toBe('failed');
    expect(update?.timestamp).toEqual(new Date(1725717660 * 1000));

    expect(update?.errorDetails).toBeDefined();
    expect(update?.errorDetails?.code).toBe(131047);
    expect(update?.errorDetails?.title).toBe('Re-engagement message');
    expect(update?.errorDetails?.message).toContain('More than 24 hours have passed');
  });

  it('should return empty array when payload contains messages but no statuses', () => {
    const updates = whatsAppAdapter.normalizeStatusUpdates(inboundMessageFixture);
    expect(updates).toEqual([]);
  });

  it('should return empty array for malformed or empty payloads', () => {
    expect(whatsAppAdapter.normalizeStatusUpdates({})).toEqual([]);
    expect(whatsAppAdapter.normalizeStatusUpdates({ entry: [] })).toEqual([]);
    expect(whatsAppAdapter.normalizeStatusUpdates(null)).toEqual([]);
    expect(whatsAppAdapter.normalizeStatusUpdates(undefined)).toEqual([]);
  });
});
