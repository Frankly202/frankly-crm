import { PrismaClient, Role, LeadCategory, LeadStatus, ChannelType, MessageDirection, MessageStatus, ActivityType } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// Safety guard: this script seeds SAMPLE/DEMO CRM data and must never run in production.
// For production admin user provisioning, use: npm run db:admin-seed
if (process.env['NODE_ENV'] === 'production') {
  console.error(
    '❌ ABORTED: prisma/seed.ts contains demo/sample data and must not run in production.',
  );
  console.error(
    '   To provision the initial admin account in production, run: npm run db:admin-seed',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.info('🌱 Starting database seed...');

  const adminEmail = process.env['INITIAL_ADMIN_EMAIL'] ?? 'emmanuel@frankedu-global.com';
  const adminPassword = process.env['INITIAL_ADMIN_PASSWORD'] ?? 'ChangeMeInEnv123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // 1. Seed Initial Superadmin (Frankly)
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: 'Emmanuel Frankly',
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      email: adminEmail,
      name: 'Emmanuel Frankly',
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.info(`👤 Seeded Admin User: ${adminUser.email} (${adminUser.id})`);

  // 2. Seed Sample Contact 1: Property Investor (WhatsApp lead)
  const contact1 = await prisma.contact.upsert({
    where: { primaryEmail: 'andreas.p@example.com' },
    update: {
      name: 'Andreas Papantoniou',
      primaryPhone: '+35799123456',
      instagramHandle: null,
      metadata: { city: 'Limassol', budgetEur: 450000 },
    },
    create: {
      name: 'Andreas Papantoniou',
      primaryEmail: 'andreas.p@example.com',
      primaryPhone: '+35799123456',
      metadata: { city: 'Limassol', budgetEur: 450000 },
    },
  });

  const lead1 = await prisma.lead.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Limassol 2-Bed Luxury Apartment Investment',
      category: LeadCategory.PROPERTY_BUYER_INVESTOR,
      status: LeadStatus.NEW,
      notes: 'Interested in high-yield rental properties in Germasogeia.',
      sourceChannel: ChannelType.WHATSAPP,
      nextActionRequired: 'Send Limassol Marina & Germasogeia PDF portfolio',
      nextActionDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
      contactId: contact1.id,
      assignedToUserId: adminUser.id,
    },
  });

  const conversation1 = await prisma.conversation.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      contactId: contact1.id,
      leadId: lead1.id,
      channel: ChannelType.WHATSAPP,
      channelThreadId: '+35799123456',
    },
  });

  await prisma.message.upsert({
    where: { externalMessageId: 'wa_msg_seed_001' },
    update: {},
    create: {
      conversationId: conversation1.id,
      direction: MessageDirection.INBOUND,
      status: MessageStatus.RECEIVED,
      body: 'Hello Frankly, I saw your Limassol property listings. Could you send me pricing details?',
      senderIdentifier: '+35799123456',
      recipientIdentifier: '+35799000000',
      externalMessageId: 'wa_msg_seed_001',
    },
  });

  await prisma.activityLog.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      leadId: lead1.id,
      userId: adminUser.id,
      type: ActivityType.LEAD_CREATED,
      description: 'Lead created via WhatsApp inbound enquiry',
    },
  });

  // 3. Seed Sample Contact 2: Study Abroad Student (Website Form lead)
  const contact2 = await prisma.contact.upsert({
    where: { primaryEmail: 'fatima.almansoori@example.com' },
    update: {
      name: 'Fatima Al-Mansoori',
      primaryPhone: '+971501234567',
      instagramHandle: '@fatima_study',
      metadata: { desiredDegree: 'MSc Data Science', targetCountries: ['Cyprus', 'UK'] },
    },
    create: {
      name: 'Fatima Al-Mansoori',
      primaryEmail: 'fatima.almansoori@example.com',
      primaryPhone: '+971501234567',
      instagramHandle: '@fatima_study',
      metadata: { desiredDegree: 'MSc Data Science', targetCountries: ['Cyprus', 'UK'] },
    },
  });

  const lead2 = await prisma.lead.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      title: 'Postgraduate Admissions 2026/2027',
      category: LeadCategory.STUDY_ABROAD_STUDENT,
      status: LeadStatus.CONTACTED,
      notes: 'Initial course guide sent via email.',
      sourceChannel: ChannelType.WEBSITE_FORM,
      nextActionRequired: 'Follow up on transcripts and IELTS scores',
      nextActionDueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      contactId: contact2.id,
      assignedToUserId: adminUser.id,
    },
  });

  await prisma.activityLog.upsert({
    where: { id: '00000000-0000-0000-0000-000000000102' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000102',
      leadId: lead2.id,
      userId: adminUser.id,
      type: ActivityType.STATUS_CHANGED,
      description: 'Status changed to CONTACTED after initial consultation email',
    },
  });

  // 4. Seed Sample Contact 3: University Partner (Email lead)
  const contact3 = await prisma.contact.upsert({
    where: { primaryEmail: 'partnerships@cyprus-university.example' },
    update: {
      name: 'Dr. Elena Georgiou',
      primaryPhone: '+35722890000',
      instagramHandle: null,
      metadata: { institution: 'University of Nicosia Research Partner' },
    },
    create: {
      name: 'Dr. Elena Georgiou',
      primaryEmail: 'partnerships@cyprus-university.example',
      primaryPhone: '+35722890000',
      metadata: { institution: 'University of Nicosia Research Partner' },
    },
  });

  const lead3 = await prisma.lead.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      title: 'Institutional Student Recruitment Agreement Q3',
      category: LeadCategory.UNIVERSITY_EDUCATION_PARTNER,
      status: LeadStatus.QUALIFIED,
      notes: 'Draft agreement reviewed. Awaiting legal sign-off.',
      sourceChannel: ChannelType.RESEND_EMAIL,
      nextActionRequired: 'Schedule partnership MOU review meeting',
      nextActionDueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      contactId: contact3.id,
      assignedToUserId: adminUser.id,
    },
  });

  await prisma.activityLog.upsert({
    where: { id: '00000000-0000-0000-0000-000000000103' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000103',
      leadId: lead3.id,
      userId: adminUser.id,
      type: ActivityType.NEXT_ACTION_SET,
      description: 'Scheduled partnership MOU review meeting',
    },
  });

  console.info('✅ Database seeded successfully with admin user and sample CRM records.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
