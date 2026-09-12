/**
 * Dedicated Production Email Recovery Script
 *
 * SCOPE:
 * 1. Backfill the 2 missing Abraham Ogbu messages into the existing conversation (e7e5c8ec-d556-441a-bf7b-a4f4d948bb1a).
 * 2. Restore the 8 design outreach contacts, leads, conversations, and messages.
 * 3. Leave Abraham's existing message (efa82c0f-733f-4737-94bf-3358d7da4d07) completely untouched.
 * 4. Exclude Global Estates, UFU, tests, marketing, and security emails.
 *
 * SAFETY GUARDS:
 * - Dry-run by default unless BOTH --execute AND --confirm-production-recovery are supplied.
 * - Fail-closed unless DATABASE_URL matches verified production Supabase.
 * - Idempotent via externalMessageId & unique constraints: SKIP if already present.
 * - Zero deletes, zero updates to existing records, zero outbound email calls.
 */

import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient, MessageDirection, MessageStatus, ChannelType, LeadCategory, LeadStatus } from '@prisma/client';

// 1. Explicitly load production backend/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL || '';

// 2. Strict fail-closed verification against production Supabase DB
if (
  !dbUrl ||
  dbUrl.includes('localhost') ||
  dbUrl.includes('_test') ||
  (!dbUrl.includes('supabase.co') && !dbUrl.includes('pooler.supabase.com') && !dbUrl.includes('sukcdaawcyxlquvtxdsi'))
) {
  console.error('\n🛑 [SAFETY ABORT] recover-production-emails.ts must target the verified production Supabase database.');
  console.error(`Received target DATABASE_URL: ${dbUrl ? dbUrl.replace(/:[^:@]+@/, ':****@') : '(empty)'}\n`);
  process.exit(1);
}

const isExecute = process.argv.includes('--execute');
const isConfirmed = process.argv.includes('--confirm-production-recovery');
const isLiveRun = isExecute && isConfirmed;

const prisma = new PrismaClient();

const COMMON_PROPOSAL_BODY = `Hello, I saw that you’re looking for a freelance graphic designer for your design projects.

I’m Emmanuel from frankedu Global. We have a graphic designer available for freelance/project work, including flyers, social media posts, brochures, logos, business cards, banners and other promotional designs.

We would be interested in working with you whenever you have projects available. I can send you some samples of our work immediately.

Thank you.`;

const SENDER_EMAIL = 'emmanuel@frankedu-global.com';
const SENDER_NAME = 'Emmanuel Frankly';
const SUBJECT_PROPOSAL = 'Freelance Graphic Design Services — FranklyEdu Global';

interface OutreachItem {
  email: string;
  externalMessageId: string;
  rfcMessageId: string;
  createdAt: Date;
}

const OUTREACH_ITEMS: OutreachItem[] = [
  {
    email: 'kariyer@protan.com.tr',
    externalMessageId: '2a0ef311-2a96-43b4-82a1-284cf0b1d038',
    rfcMessageId: '<010201a0924284ba-93af785b-186d-4b67-a13a-6d936a2b935f-000000@eu-west-1.amazonses.com>',
    createdAt: new Date('2026-09-11T20:57:07.695Z'),
  },
  {
    email: 'ik@baykartech.com',
    externalMessageId: 'bbde713b-ce9d-4842-90be-589f9efe892f',
    rfcMessageId: '<010201a0924419e6-5adbfe19-38d8-4602-a78e-21d9f75b9160-000000@eu-west-1.amazonses.com>',
    createdAt: new Date('2026-09-11T20:58:51.414Z'),
  },
  {
    email: 'london@pentagram.com',
    externalMessageId: '66a06e6a-edd1-4b7d-9017-71208e0cf427',
    rfcMessageId: '<010201a09244e5ba-7c26bbf0-3fba-409a-aa1a-92777fe2b3a1-000000@eu-west-1.amazonses.com>',
    createdAt: new Date('2026-09-11T20:59:43.613Z'),
  },
  {
    email: 'hello@1204studios.com',
    externalMessageId: '2be0ec3c-3aa4-469b-8a3d-bf046b8d1bc5',
    rfcMessageId: '<010201a092459f9b-10d30ae8-04e1-4d85-abf5-13ffd2ce62a1-000000@eu-west-1.amazonses.com>',
    createdAt: new Date('2026-09-11T21:00:31.187Z'),
  },
  {
    email: 'recruitment@nup.ac.cy',
    externalMessageId: 'ff3334fc-35bf-4609-90c4-47a32fe2b69a',
    rfcMessageId: '<010201a09246784d-1a26f90c-5e65-4266-8fe2-fd6ee8629443-000000@eu-west-1.amazonses.com>',
    createdAt: new Date('2026-09-11T21:01:26.684Z'),
  },
  {
    email: 'cv@essoftware.com.tr',
    externalMessageId: 'f0936f45-edb8-4802-a820-dc4fd4b66473',
    rfcMessageId: '<010201a092471f1c-847345ff-726c-4a40-ae12-4897a62ffb9e-000000@eu-west-1.amazonses.com>',
    createdAt: new Date('2026-09-11T21:02:09.376Z'),
  },
  {
    email: 'info@design-um.com',
    externalMessageId: '30e54c17-c0e2-420e-9191-40d49c5e8ad5',
    rfcMessageId: '<010201a09247c1f0-497fe77a-5a65-4ec6-ba32-12176e617a59-000000@eu-west-1.amazonses.com>',
    createdAt: new Date('2026-09-11T21:02:50.987Z'),
  },
  {
    email: 'careers@primestixng.com',
    externalMessageId: '5cbc9948-822c-41f8-879d-2b49b02a7026',
    rfcMessageId: '<010201a092487a33-3c539794-8a18-430e-b372-fb2453d935df-000000@eu-west-1.amazonses.com>',
    createdAt: new Date('2026-09-11T21:03:38.188Z'),
  },
];

async function runRecovery() {
  console.log('================================================================');
  console.log('🛡️  PRODUCTION CRM EMAIL RECOVERY RUNNER');
  console.log('================================================================');
  console.log(`Target Database Host: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Execution Mode: ${isLiveRun ? '🟢 LIVE PRODUCTION WRITES' : '🟡 DRY-RUN ONLY (Read-Only)'}`);
  if (!isLiveRun) {
    console.log('NOTE: To execute writes, supply BOTH --execute and --confirm-production-recovery.');
  }
  console.log('----------------------------------------------------------------\n');

  // Find admin user for assignment
  const adminUser = await prisma.user.findFirst({
    where: { email: SENDER_EMAIL },
  });

  const assignedUserId = adminUser?.id || null;
  console.log(`Assigned Admin User: ${adminUser ? `${adminUser.name} (${adminUser.id})` : 'None (null)'}`);

  const summary = {
    abraham: { created: 0, skipped: 0, conflicts: 0 },
    outreach: { created: 0, skipped: 0, conflicts: 0 },
  };

  // ============================================================================
  // BATCH 1: Abraham Ogbu Thread Recovery
  // ============================================================================
  console.log('\n--- Processing Batch 1: Abraham Ogbu Thread ---');
  const abrahamContact = await prisma.contact.findUnique({
    where: { primaryEmail: 'abrahamogbu.dev@gmail.com' },
    include: {
      conversations: {
        where: { channel: ChannelType.RESEND_EMAIL },
        include: { messages: true },
      },
    },
  });

  if (!abrahamContact) {
    throw new Error('FATAL: Existing contact abrahamogbu.dev@gmail.com not found in production database!');
  }

  const abrahamConversation = abrahamContact.conversations[0];
  if (!abrahamConversation) {
    throw new Error('FATAL: Existing RESEND_EMAIL conversation not found for abrahamogbu.dev@gmail.com!');
  }

  console.log(`Found Existing Conversation ID: ${abrahamConversation.id}`);
  console.log(`Existing Messages in Conversation: ${abrahamConversation.messages.length}`);

  const abrahamPlannedMessages = [
    {
      label: 'Message 1 (Outbound Initiation)',
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.SENT,
      senderIdentifier: 'emmanuel@frankedu-global.com',
      senderName: SENDER_NAME,
      recipientIdentifier: 'abrahamogbu.dev@gmail.com',
      subject: SUBJECT_PROPOSAL,
      body: COMMON_PROPOSAL_BODY,
      externalMessageId: '2bf22187-09e9-49ec-b4ff-a7e1dc7c85ec',
      rfcMessageId: '<010201a094544531-2d9b9f98-e32b-4c11-add0-8918a897452d-000000@eu-west-1.amazonses.com>',
      inReplyTo: null,
      references: null,
      createdAt: new Date('2026-09-12T06:35:45.540Z'),
    },
    {
      label: 'Message 2 (Inbound Reply #1)',
      direction: MessageDirection.INBOUND,
      status: MessageStatus.RECEIVED,
      senderIdentifier: 'abrahamogbu.dev@gmail.com',
      senderName: 'Abraham Ogbu',
      recipientIdentifier: 'frankly@huejoraata.resend.app',
      subject: 'Re: ' + SUBJECT_PROPOSAL,
      body: `Hello Emmanuel,\n\nThank you for reaching out. I'll definitely keep this in mind and reach out if I have any design projects that come up.\n\nBest regards,\nAbraham`,
      externalMessageId: '848f2485-ba93-49d6-899e-8dc2a6815291',
      rfcMessageId: '<CAJrnk5P1YVES8=g086eKhu3swt-aeuAfg1XaKCA-1O50XUuL6g@mail.gmail.com>',
      inReplyTo: '<010201a094544531-2d9b9f98-e32b-4c11-add0-8918a897452d-000000@eu-west-1.amazonses.com>',
      references: JSON.stringify(['<010201a094544531-2d9b9f98-e32b-4c11-add0-8918a897452d-000000@eu-west-1.amazonses.com>']),
      createdAt: new Date('2026-09-12T06:37:09.145Z'),
    },
  ];

  for (const item of abrahamPlannedMessages) {
    const existing = await prisma.message.findUnique({
      where: { externalMessageId: item.externalMessageId },
    });

    if (existing) {
      if (
        existing.direction !== item.direction ||
        existing.conversationId !== abrahamConversation.id ||
        existing.rfcMessageId !== item.rfcMessageId
      ) {
        console.error(`🚨 CONFLICT on ${item.externalMessageId}: stored metadata does not match Resend payload!`);
        summary.abraham.conflicts++;
        throw new Error(`Conflict detected on externalMessageId: ${item.externalMessageId}`);
      } else {
        console.log(`[SKIP] ${item.label} (externalMessageId: ${item.externalMessageId}) already present.`);
        summary.abraham.skipped++;
      }
    } else {
      console.log(`[PLAN] ${item.label} (externalMessageId: ${item.externalMessageId}) -> Insert into Conversation ${abrahamConversation.id}`);
      summary.abraham.created++;
      if (isLiveRun) {
        await prisma.message.create({
          data: {
            conversationId: abrahamConversation.id,
            direction: item.direction,
            status: item.status,
            senderIdentifier: item.senderIdentifier,
            senderName: item.senderName,
            recipientIdentifier: item.recipientIdentifier,
            subject: item.subject,
            body: item.body,
            externalMessageId: item.externalMessageId,
            rfcMessageId: item.rfcMessageId,
            inReplyTo: item.inReplyTo,
            references: item.references,
            createdAt: item.createdAt,
          },
        });
        console.log(`  ✅ CREATED Message: ${item.externalMessageId}`);
      }
    }
  }

  // ============================================================================
  // BATCH 2: Eight Design Outreach Leads Recovery
  // ============================================================================
  console.log('\n--- Processing Batch 2: 8 Design Outreach Leads ---');
  for (let i = 0; i < OUTREACH_ITEMS.length; i++) {
    const item = OUTREACH_ITEMS[i]!;
    console.log(`\n[${i + 1}/8] Outreach to: ${item.email}`);

    const existingMsg = await prisma.message.findUnique({
      where: { externalMessageId: item.externalMessageId },
    });

    if (existingMsg) {
      console.log(`  [SKIP] Message already exists: ${item.externalMessageId}`);
      summary.outreach.skipped++;
      continue;
    }

    summary.outreach.created++;
    console.log(`  [PLAN] Create Contact -> Lead -> Conversation -> Message for ${item.email}`);
    console.log(`         • Contact Name (reconstructed): ${item.email}`);
    console.log(`         • Lead Category (reconstructed): OTHER_BUSINESS`);
    console.log(`         • Lead Status (reconstructed): CONTACTED`);
    console.log(`         • Lead SourceChannel (reconstructed): RESEND_EMAIL`);

    if (isLiveRun) {
      await prisma.$transaction(async (tx) => {
        // 1. Resolve or Create Contact
        let contact = await tx.contact.findUnique({
          where: { primaryEmail: item.email },
        });

        if (!contact) {
          contact = await tx.contact.create({
            data: {
              name: item.email, // Reconstructed CRM metadata
              primaryEmail: item.email,
              createdAt: item.createdAt,
            },
          });
        }

        // 2. Create Lead
        let lead = await tx.lead.findFirst({
          where: { contactId: contact.id, sourceChannel: ChannelType.RESEND_EMAIL },
        });

        if (!lead) {
          lead = await tx.lead.create({
            data: {
              contactId: contact.id,
              title: `Outbound Design Outreach: ${item.email}`, // Reconstructed CRM metadata
              category: LeadCategory.OTHER_BUSINESS, // Reconstructed CRM metadata
              status: LeadStatus.CONTACTED, // Reconstructed CRM metadata
              sourceChannel: ChannelType.RESEND_EMAIL, // Reconstructed CRM metadata
              assignedToUserId: assignedUserId, // Reconstructed CRM metadata
              createdAt: item.createdAt,
            },
          });
        }

        // 3. Resolve or Create Conversation
        let conversation = await tx.conversation.findUnique({
          where: {
            contactId_channel: {
              contactId: contact.id,
              channel: ChannelType.RESEND_EMAIL,
            },
          },
        });

        if (!conversation) {
          conversation = await tx.conversation.create({
            data: {
              contactId: contact.id,
              leadId: lead.id,
              channel: ChannelType.RESEND_EMAIL,
              channelThreadId: item.email,
              lastMessageAt: item.createdAt,
              createdAt: item.createdAt,
            },
          });
        }

        // 4. Create Message
        await tx.message.create({
          data: {
            conversationId: conversation.id,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.SENT,
            senderIdentifier: SENDER_EMAIL,
            senderName: SENDER_NAME,
            recipientIdentifier: item.email,
            subject: SUBJECT_PROPOSAL,
            body: COMMON_PROPOSAL_BODY,
            externalMessageId: item.externalMessageId,
            rfcMessageId: item.rfcMessageId,
            createdAt: item.createdAt,
          },
        });

        console.log(`  ✅ CREATED: Message ${item.externalMessageId} in Conversation ${conversation.id}`);
      });
    }
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log('RECOVERY SUMMARY');
  console.log('================================================================');
  console.log(`Batch 1 (Abraham Ogbu Thread):`);
  console.log(`  - To Create: ${summary.abraham.created}`);
  console.log(`  - Skipped:   ${summary.abraham.skipped}`);
  console.log(`  - Conflicts: ${summary.abraham.conflicts}`);
  console.log(`Batch 2 (8 Design Outreach Leads):`);
  console.log(`  - To Create: ${summary.outreach.created}`);
  console.log(`  - Skipped:   ${summary.outreach.skipped}`);
  console.log(`  - Conflicts: ${summary.outreach.conflicts}`);
  console.log(`Mode: ${isLiveRun ? '🟢 EXECUTED TO DATABASE' : '🟡 DRY-RUN COMPLETE (Zero DB writes)'}`);
  console.log('================================================================\n');
}

runRecovery()
  .catch((err) => {
    console.error('\n❌ Fatal error during recovery:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
