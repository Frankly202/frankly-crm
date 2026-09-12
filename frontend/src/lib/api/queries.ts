import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, buildQuery } from "./client";
import type {
  Activity,
  ActivityType,
  Contact,
  ContactDetail,
  Conversation,
  ConversationDetail,
  DashboardMetrics,
  Lead,
  LeadDetail,
  LeadStatus,
  Message,
  PaginationMeta,
  StartEmailConversationInput,
  StartEmailConversationResponse,
} from "./types";

export const queryKeys = {
  auth: { me: ["auth", "me"] as const },
  contacts: {
    all: ["contacts"] as const,
    list: (params: Record<string, unknown>) => ["contacts", "list", params] as const,
    detail: (id: string) => ["contacts", "detail", id] as const,
  },
  leads: {
    all: ["leads"] as const,
    list: (params: Record<string, unknown>) => ["leads", "list", params] as const,
    detail: (id: string) => ["leads", "detail", id] as const,
    activities: (id: string) => ["leads", "activities", id] as const,
  },
  metrics: { dashboard: ["metrics", "dashboard"] as const },
  conversations: {
    all: ["conversations"] as const,
    list: (params: Record<string, unknown>) => ["conversations", "list", params] as const,
    detail: (id: string) => ["conversations", "detail", id] as const,
    unreadCount: (channel?: string | undefined) =>
      ["conversations", "unread-count", channel] as const,
  },
};

export interface ListResult<T> {
  data: T[];
  meta?: PaginationMeta | undefined;
}

/* Dashboard */
export const useDashboardMetrics = () =>
  useQuery({
    queryKey: queryKeys.metrics.dashboard,
    queryFn: async () => (await apiRequest<DashboardMetrics>("/leads/dashboard/metrics")).data,
  });

/* Leads */
export interface LeadFilters extends Record<string, unknown> {
  page?: number | undefined;
  limit?: number | undefined;
  search?: string | undefined;
  status?: string | undefined;
  category?: string | undefined;
  sourceChannel?: string | undefined;
  assignedToUserId?: string | undefined;
  hasPendingNextAction?: boolean | undefined;
}

export const useLeads = (filters: LeadFilters) =>
  useQuery({
    queryKey: queryKeys.leads.list(filters),
    queryFn: async (): Promise<ListResult<Lead>> => {
      const res = await apiRequest<Lead[]>(`/leads${buildQuery(filters)}`);
      return { data: res.data, meta: res.meta };
    },
    placeholderData: (prev) => prev,
  });

export const useLead = (id: string) =>
  useQuery({
    queryKey: queryKeys.leads.detail(id),
    queryFn: async () => (await apiRequest<LeadDetail>(`/leads/${id}`)).data,
  });

export const useLeadActivities = (id: string) =>
  useQuery({
    queryKey: queryKeys.leads.activities(id),
    queryFn: async () => (await apiRequest<Activity[]>(`/leads/${id}/activities`)).data,
  });

function useLeadInvalidation(id?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.leads.all });
    qc.invalidateQueries({ queryKey: queryKeys.metrics.dashboard });
    qc.invalidateQueries({ queryKey: queryKeys.contacts.all });
    if (id) qc.invalidateQueries({ queryKey: queryKeys.leads.activities(id) });
  };
}

export const useCreateLead = () => {
  const invalidate = useLeadInvalidation();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await apiRequest<Lead>("/leads", { method: "POST", body })).data,
    onSuccess: invalidate,
  });
};

export const useUpdateLead = (id: string) => {
  const invalidate = useLeadInvalidation(id);
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await apiRequest<Lead>(`/leads/${id}`, { method: "PATCH", body })).data,
    onSuccess: invalidate,
  });
};

export const useUpdateLeadStatus = (id: string) => {
  const invalidate = useLeadInvalidation(id);
  return useMutation({
    mutationFn: async (body: { status: LeadStatus; note?: string }) =>
      (await apiRequest<Lead>(`/leads/${id}/status`, { method: "PATCH", body })).data,
    onSuccess: invalidate,
  });
};

export const useAssignLead = (id: string) => {
  const invalidate = useLeadInvalidation(id);
  return useMutation({
    mutationFn: async (assignedToUserId: string | null) =>
      (
        await apiRequest<Lead>(`/leads/${id}/assign`, {
          method: "PATCH",
          body: { assignedToUserId },
        })
      ).data,
    onSuccess: invalidate,
  });
};

export const useAddActivity = (id: string) => {
  const invalidate = useLeadInvalidation(id);
  return useMutation({
    mutationFn: async (body: { type: ActivityType; description: string }) =>
      (await apiRequest<Activity>(`/leads/${id}/activities`, { method: "POST", body })).data,
    onSuccess: invalidate,
  });
};

/* Contacts */
export interface ContactFilters extends Record<string, unknown> {
  page?: number | undefined;
  limit?: number | undefined;
  search?: string | undefined;
}

export const useContacts = (filters: ContactFilters) =>
  useQuery({
    queryKey: queryKeys.contacts.list(filters),
    queryFn: async (): Promise<ListResult<Contact>> => {
      const res = await apiRequest<Contact[]>(`/contacts${buildQuery(filters)}`);
      return { data: res.data, meta: res.meta };
    },
    placeholderData: (prev) => prev,
  });

export const useContact = (id: string) =>
  useQuery({
    queryKey: queryKeys.contacts.detail(id),
    queryFn: async () => (await apiRequest<ContactDetail>(`/contacts/${id}`)).data,
  });

export const useCreateContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await apiRequest<Contact>("/contacts", { method: "POST", body })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contacts.all });
      qc.invalidateQueries({ queryKey: queryKeys.metrics.dashboard });
    },
  });
};

/* Conversations */
export interface ConversationFilters extends Record<string, unknown> {
  page?: number | undefined;
  limit?: number | undefined;
  search?: string | undefined;
  channel?: string | undefined;
  unreadOnly?: boolean | undefined;
}

export const INBOX_POLL_INTERVAL = 15000;

export const useConversations = (filters: ConversationFilters) =>
  useQuery({
    queryKey: queryKeys.conversations.list(filters),
    queryFn: async (): Promise<ListResult<Conversation>> => {
      const res = await apiRequest<Conversation[]>(`/conversations${buildQuery(filters)}`);
      return { data: res.data, meta: res.meta };
    },
    placeholderData: (prev) => prev,
    refetchInterval: INBOX_POLL_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

export const useUnreadCount = (channel?: string | undefined) =>
  useQuery({
    queryKey: queryKeys.conversations.unreadCount(channel),
    queryFn: async (): Promise<{ unreadCount: number }> => {
      const query = channel ? `?channel=${encodeURIComponent(channel)}` : "";
      const res = await apiRequest<{ unreadCount: number }>(`/conversations/unread-count${query}`);
      return res.data;
    },
    refetchInterval: INBOX_POLL_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

export const useConversation = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.conversations.detail(id ?? "none"),
    queryFn: async () => (await apiRequest<ConversationDetail>(`/conversations/${id}`)).data,
    enabled: Boolean(id),
    refetchInterval: INBOX_POLL_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

export const useSendMessage = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { body: string; subject?: string }) => {
      const body = typeof input === "string" ? { body: input } : input;
      return (
        await apiRequest<Message>(`/conversations/${id}/messages`, {
          method: "POST",
          body,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
};

export const useStartEmailConversation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartEmailConversationInput) =>
      (
        await apiRequest<StartEmailConversationResponse>("/conversations/start-email", {
          method: "POST",
          body: input as unknown as Record<string, unknown>,
        })
      ).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
      qc.invalidateQueries({ queryKey: queryKeys.contacts.all });
      qc.invalidateQueries({ queryKey: queryKeys.leads.all });
      if (data?.conversationId) {
        qc.invalidateQueries({ queryKey: queryKeys.conversations.detail(data.conversationId) });
      }
    },
  });
};

export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (
        await apiRequest<{ id: string; isUnread: boolean }>(`/conversations/${id}/read`, {
          method: "PATCH",
        })
      ).data,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.conversations.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
};
