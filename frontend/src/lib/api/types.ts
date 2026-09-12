export type Role = "ADMIN" | "AGENT";

export type LeadCategory =
  | "PROPERTY_BUYER_INVESTOR"
  | "PROPERTY_SELLER_AGENT"
  | "STUDY_ABROAD_STUDENT"
  | "UNIVERSITY_EDUCATION_PARTNER"
  | "OTHER_BUSINESS";

export type LeadStatus = "NEW" | "CONTACTED" | "REPLIED" | "QUALIFIED" | "LOST" | "CLOSED_WON";

export type ChannelType = "WHATSAPP" | "INSTAGRAM" | "RESEND_EMAIL" | "WEBSITE_FORM";

export type ActivityType =
  | "LEAD_CREATED"
  | "STATUS_CHANGED"
  | "LEAD_ASSIGNED"
  | "MESSAGE_SENT"
  | "MESSAGE_RECEIVED"
  | "NOTE_ADDED"
  | "NEXT_ACTION_SET";

export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageStatus = "PENDING" | "RECEIVED" | "SENT" | "DELIVERED" | "FAILED";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Contact {
  id: string;
  name: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  instagramHandle: string | null;
  metadata?: Record<string, unknown> | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ContactDetail extends Contact {
  leads: Lead[];
  conversations: Conversation[];
}

export interface Lead {
  id: string;
  title: string;
  category: LeadCategory;
  status: LeadStatus;
  sourceChannel: ChannelType;
  contactId: string;
  assignedToUserId: string | null;
  notes: string | null;
  nextActionRequired: string | null;
  nextActionDueDate: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: Contact | undefined;
  assignedTo?: User | null | undefined;
}

export interface Activity {
  id: string;
  leadId: string;
  userId: string | null;
  type: ActivityType;
  description: string;
  metadata?: Record<string, unknown> | null | undefined;
  createdAt: string;
  user?: Pick<User, "id" | "name" | "email"> | null | undefined;
}

export interface LeadDetail extends Lead {
  conversations: Conversation[];
  activities: Activity[];
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  status: MessageStatus;
  body: string;
  senderName?: string | null;
  subject?: string | null;
  rfcMessageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  createdAt: string;
}

export interface StartEmailConversationInput {
  to: string;
  recipientName?: string | undefined;
  subject: string;
  body: string;
  leadCategory?: LeadCategory | undefined;
  idempotencyKey?: string | undefined;
}

export interface StartEmailConversationResponse {
  conversationId: string;
  messageId: string;
  status: MessageStatus;
  externalMessageId?: string;
  deduplicated?: boolean;
}

export interface Conversation {
  id: string;
  contactId: string;
  leadId: string | null;
  channel: ChannelType;
  channelThreadId: string;
  lastMessageAt: string;
  lastReadAt: string | null;
  isUnread: boolean;
  contact?: Contact | undefined;
  lead?: Pick<Lead, "id" | "title" | "category" | "status" | "assignedToUserId"> | null | undefined;
  latestMessage?:
    Pick<Message, "id" | "direction" | "status" | "body" | "createdAt"> | null | undefined;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface DashboardMetrics {
  totals: { totalLeads: number; totalContacts: number };
  byStatus: Record<LeadStatus, number>;
  byCategory: Record<LeadCategory, number>;
  nextActions: {
    totalPending: number;
    overdue: number;
    dueToday: number;
    upcoming: number;
    noDueDate: number;
  };
  recentActivity: { leadsCreatedToday: number; leadsCreatedThisWeek: number };
}

export const LEAD_CATEGORY_LABELS: Record<LeadCategory, string> = {
  PROPERTY_BUYER_INVESTOR: "Property Buyer / Investor",
  PROPERTY_SELLER_AGENT: "Property Seller / Agent",
  STUDY_ABROAD_STUDENT: "Study Abroad Student",
  UNIVERSITY_EDUCATION_PARTNER: "Education Partner",
  OTHER_BUSINESS: "Other Business",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  QUALIFIED: "Qualified",
  LOST: "Lost",
  CLOSED_WON: "Closed / Won",
};

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  RESEND_EMAIL: "Email",
  WEBSITE_FORM: "Website Form",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  LEAD_CREATED: "Lead Created",
  STATUS_CHANGED: "Status Changed",
  LEAD_ASSIGNED: "Lead Assigned",
  MESSAGE_SENT: "Message Sent",
  MESSAGE_RECEIVED: "Message Received",
  NOTE_ADDED: "Note Added",
  NEXT_ACTION_SET: "Next Action Set",
};

export const LEAD_CATEGORIES = Object.keys(LEAD_CATEGORY_LABELS) as LeadCategory[];
export const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];
export const CHANNELS = Object.keys(CHANNEL_LABELS) as ChannelType[];
