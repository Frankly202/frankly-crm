import { useMemo } from "react";
import { useLeads } from "./queries";
import { useAuth } from "@/lib/auth";
import type { User } from "./types";

/**
 * The API contract exposes no user-directory endpoint, so the assignable team
 * is derived from the users already present on leads plus the signed-in user.
 */
export function useTeamMembers(): User[] {
  const { user } = useAuth();
  const { data } = useLeads({ limit: 100 });

  return useMemo(() => {
    const map = new Map<string, User>();
    if (user) map.set(user.id, user);
    for (const lead of data?.data ?? []) {
      if (lead.assignedTo) map.set(lead.assignedTo.id, lead.assignedTo);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, user]);
}
