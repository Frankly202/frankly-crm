import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { Role, LeadCategory, LeadStatus, ChannelType, MessageDirection } from '@prisma/client';

describe('Prisma Database & Domain Layer Integration', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('should verify the seeded initial admin user exists and password hash is valid', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: 'emmanuel@frankedu-global.com' },
    });

    expect(admin).not.toBeNull();
    expect(admin?.role).toBe(Role.ADMIN);
    expect(admin?.isActive).toBe(true);

    const adminPassword = process.env['INITIAL_ADMIN_PASSWORD'] ?? 'FranklyAdmin2026!';
    const isMatch = await bcrypt.compare(adminPassword, admin?.passwordHash ?? '');
    expect(isMatch).toBe(true);
  });

  it('should query seeded contacts with relational leads and conversations', async () => {
    const contacts = await prisma.contact.findMany({
      include: {
        leads: true,
        conversations: {
          include: {
            messages: true,
          },
        },
      },
    });

    expect(contacts.length).toBeGreaterThanOrEqual(3);

    // Find the property investor contact
    const propertyContact = contacts.find((c) => c.primaryEmail === 'andreas.p@example.com');
    expect(propertyContact).toBeDefined();
    expect(propertyContact?.leads[0]?.category).toBe(LeadCategory.PROPERTY_BUYER_INVESTOR);
    expect(propertyContact?.conversations[0]?.channel).toBe(ChannelType.WHATSAPP);
    expect(propertyContact?.conversations[0]?.messages[0]?.direction).toBe(MessageDirection.INBOUND);
  });

  it('should support creating and cascading delete on Contact and related Lead', async () => {
    // Create test contact
    const testContact = await prisma.contact.create({
      data: {
        name: 'Temporary Test Lead',
        primaryEmail: 'temp.lead@test.example',
        primaryPhone: '+35799999999',
      },
    });

    // Create test lead attached to contact
    const testLead = await prisma.lead.create({
      data: {
        title: 'Education Partnership Exploration',
        category: LeadCategory.OTHER_BUSINESS,
        status: LeadStatus.NEW,
        sourceChannel: ChannelType.WEBSITE_FORM,
        nextActionRequired: 'Review company profile',
        nextActionDueDate: new Date(),
        contactId: testContact.id,
      },
    });

    expect(testLead.id).toBeDefined();
    expect(testLead.contactId).toBe(testContact.id);

    // Delete contact - should cascade to lead
    await prisma.contact.delete({
      where: { id: testContact.id },
    });

    const deletedLead = await prisma.lead.findUnique({
      where: { id: testLead.id },
    });
    expect(deletedLead).toBeNull();
  });

  it('should enforce unique externalMessageId on Message table to prevent webhook duplicate processing', async () => {
    const conversation = await prisma.conversation.findFirst();
    expect(conversation).toBeDefined();

    const duplicateMessageId = 'test_dup_external_001';

    // Insert first message
    const msg1 = await prisma.message.create({
      data: {
        conversationId: conversation!.id,
        direction: MessageDirection.INBOUND,
        body: 'First incoming payload',
        senderIdentifier: 'client_1',
        recipientIdentifier: 'frankly_crm',
        externalMessageId: duplicateMessageId,
      },
    });
    expect(msg1.id).toBeDefined();

    // Attempt to insert second message with same externalMessageId - must fail
    await expect(
      prisma.message.create({
        data: {
          conversationId: conversation!.id,
          direction: MessageDirection.INBOUND,
          body: 'Second duplicate webhook payload',
          senderIdentifier: 'client_1',
          recipientIdentifier: 'frankly_crm',
          externalMessageId: duplicateMessageId,
        },
      }),
    ).rejects.toThrow();

    // Cleanup test message
    await prisma.message.delete({
      where: { id: msg1.id },
    });
  });
});
