import { prisma } from '../../config/database.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../common/errors/app-error.js';
import {
  CreateLeadInput,
  UpdateLeadInput,
  UpdateLeadStatusInput,
  AssignLeadInput,
  CreateActivityInput,
  LeadQueryInput,
} from './lead.schemas.js';
import {
  parsePaginationParams,
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/utils/pagination.util.js';
import {
  Lead,
  LeadStatus,
  LeadCategory,
  ActivityType,
  Role,
  Prisma,
} from '@prisma/client';

export interface CurrentUserContext {
  id: string;
  role: Role;
  email?: string;
  name?: string;
}

export interface PaginatedLeads {
  leads: unknown[];
  meta: PaginationMeta;
}

export interface DashboardMetrics {
  totals: {
    totalLeads: number;
    totalContacts: number;
  };
  byStatus: Record<LeadStatus, number>;
  byCategory: Record<LeadCategory, number>;
  nextActions: {
    totalPending: number;
    overdue: number;
    dueToday: number;
    upcoming: number;
    noDueDate: number;
  };
  recentActivity: {
    leadsCreatedToday: number;
    leadsCreatedThisWeek: number;
  };
}

export class LeadService {
  async listLeads(query: LeadQueryInput): Promise<PaginatedLeads> {
    const { page, limit, skip, take } = parsePaginationParams(query);

    const where: Prisma.LeadWhereInput = {};

    if (query.category) {
      where.category = query.category;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.assignedToUserId) {
      where.assignedToUserId = query.assignedToUserId;
    }

    if (query.sourceChannel) {
      where.sourceChannel = query.sourceChannel;
    }

    if (query.hasPendingNextAction !== undefined) {
      if (query.hasPendingNextAction) {
        where.nextActionRequired = { not: null };
      } else {
        where.nextActionRequired = null;
      }
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { nextActionRequired: { contains: search, mode: 'insensitive' } },
        { contact: { name: { contains: search, mode: 'insensitive' } } },
        { contact: { primaryEmail: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              primaryEmail: true,
              primaryPhone: true,
              instagramHandle: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    return {
      leads,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async getLeadById(id: string) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        contact: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        conversations: {
          orderBy: { lastMessageAt: 'desc' },
          select: {
            id: true,
            channel: true,
            channelThreadId: true,
            lastMessageAt: true,
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!lead) {
      throw new NotFoundError(`Lead with ID ${id} not found`);
    }

    return lead;
  }

  async createLead(input: CreateLeadInput, currentUser?: CurrentUserContext): Promise<Lead> {
    // 1. Verify Contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
    });
    if (!contact) {
      throw new NotFoundError(`Contact with ID ${input.contactId} not found`);
    }

    // 2. Verify assigned user exists and is active, enforcing role permissions
    if (input.assignedToUserId) {
      if (currentUser?.role === Role.AGENT && input.assignedToUserId !== currentUser.id) {
        throw new ForbiddenError('Agents can only assign leads to themselves');
      }

      const user = await prisma.user.findUnique({
        where: { id: input.assignedToUserId },
      });
      if (!user) {
        throw new NotFoundError(`Assigned user with ID ${input.assignedToUserId} not found`);
      }
      if (!user.isActive) {
        throw new BadRequestError('Cannot assign lead to a deactivated user account');
      }
    }

    // 3. Create lead and initial activity log inside a transaction
    return prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          title: input.title,
          category: input.category,
          status: input.status ?? LeadStatus.NEW,
          sourceChannel: input.sourceChannel,
          notes: input.notes ?? null,
          nextActionRequired: input.nextActionRequired ?? null,
          nextActionDueDate: input.nextActionDueDate ?? null,
          contactId: input.contactId,
          assignedToUserId: input.assignedToUserId ?? null,
        },
      });

      await tx.activityLog.create({
        data: {
          leadId: lead.id,
          userId: currentUser?.id ?? null,
          type: ActivityType.LEAD_CREATED,
          description: `Lead created under category ${input.category}`,
          metadata: {
            initialStatus: lead.status,
            sourceChannel: lead.sourceChannel,
          },
        },
      });

      if (lead.nextActionRequired) {
        await tx.activityLog.create({
          data: {
            leadId: lead.id,
            userId: currentUser?.id ?? null,
            type: ActivityType.NEXT_ACTION_SET,
            description: `Next action set: ${lead.nextActionRequired}`,
            metadata: {
              dueDate: lead.nextActionDueDate,
            },
          },
        });
      }

      return lead;
    });
  }

  async updateLead(
    id: string,
    input: UpdateLeadInput,
    currentUser?: CurrentUserContext,
  ): Promise<Lead> {
    const existing = await prisma.lead.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Lead with ID ${id} not found`);
    }

    if (input.assignedToUserId !== undefined) {
      if (input.assignedToUserId !== null) {
        if (currentUser?.role === Role.AGENT && input.assignedToUserId !== currentUser.id) {
          throw new ForbiddenError('Agents can only assign leads to themselves');
        }

        const user = await prisma.user.findUnique({
          where: { id: input.assignedToUserId },
        });
        if (!user) {
          throw new NotFoundError(`Assigned user with ID ${input.assignedToUserId} not found`);
        }
        if (!user.isActive) {
          throw new BadRequestError('Cannot assign lead to a deactivated user account');
        }
      } else if (currentUser?.role === Role.AGENT && existing.assignedToUserId !== null) {
        throw new ForbiddenError('Only administrators can unassign leads');
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.sourceChannel !== undefined && { sourceChannel: input.sourceChannel }),
          ...(input.assignedToUserId !== undefined && { assignedToUserId: input.assignedToUserId }),
          ...(input.nextActionRequired !== undefined && {
            nextActionRequired: input.nextActionRequired,
          }),
          ...(input.nextActionDueDate !== undefined && {
            nextActionDueDate: input.nextActionDueDate,
          }),
        },
      });

      // Log next action if it changed
      if (
        input.nextActionRequired !== undefined &&
        input.nextActionRequired !== existing.nextActionRequired
      ) {
        await tx.activityLog.create({
          data: {
            leadId: id,
            userId: currentUser?.id ?? null,
            type: ActivityType.NEXT_ACTION_SET,
            description: input.nextActionRequired
              ? `Next action updated: ${input.nextActionRequired}`
              : 'Next action cleared',
            metadata: {
              dueDate: updated.nextActionDueDate,
            },
          },
        });
      }

      return updated;
    });
  }

  async updateLeadStatus(
    id: string,
    input: UpdateLeadStatusInput,
    currentUser?: CurrentUserContext,
  ): Promise<Lead> {
    const existing = await prisma.lead.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Lead with ID ${id} not found`);
    }

    if (existing.status === input.status) {
      return existing;
    }

    // Lead status transition rule: cannot revert in-progress or closed lead back to NEW
    if (existing.status !== LeadStatus.NEW && input.status === LeadStatus.NEW) {
      throw new BadRequestError('Cannot revert an in-progress or closed lead back to NEW status');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          status: input.status,
        },
      });

      await tx.activityLog.create({
        data: {
          leadId: id,
          userId: currentUser?.id ?? null,
          type: ActivityType.STATUS_CHANGED,
          description: `Status changed from ${existing.status} to ${input.status}`,
          metadata: {
            previousStatus: existing.status,
            newStatus: input.status,
            note: input.note ?? null,
          },
        },
      });

      return updated;
    });
  }

  async assignLead(
    id: string,
    input: AssignLeadInput,
    currentUser?: CurrentUserContext,
  ): Promise<Lead> {
    const existing = await prisma.lead.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Lead with ID ${id} not found`);
    }

    // Agent role authorization checks
    if (currentUser?.role === Role.AGENT) {
      if (input.assignedToUserId === null) {
        throw new ForbiddenError('Only administrators can unassign leads');
      }
      if (input.assignedToUserId !== currentUser.id) {
        throw new ForbiddenError('Agents can only assign leads to themselves');
      }
      if (existing.assignedToUserId && existing.assignedToUserId !== currentUser.id) {
        throw new ForbiddenError('Cannot reassign a lead currently assigned to another team member');
      }
    }

    let assigneeName = 'Unassigned';
    if (input.assignedToUserId) {
      const assignee = await prisma.user.findUnique({
        where: { id: input.assignedToUserId },
      });
      if (!assignee) {
        throw new NotFoundError(`User with ID ${input.assignedToUserId} not found`);
      }
      if (!assignee.isActive) {
        throw new BadRequestError('Cannot assign lead to a deactivated user account');
      }
      assigneeName = assignee.name;
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          assignedToUserId: input.assignedToUserId,
        },
      });

      await tx.activityLog.create({
        data: {
          leadId: id,
          userId: currentUser?.id ?? null,
          type: ActivityType.LEAD_ASSIGNED,
          description: `Lead assigned to ${assigneeName}`,
          metadata: {
            assignedToUserId: input.assignedToUserId,
          },
        },
      });

      return updated;
    });
  }

  async addActivity(
    leadId: string,
    input: CreateActivityInput,
    currentUserId?: string,
  ) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new NotFoundError(`Lead with ID ${leadId} not found`);
    }

    const activity = await prisma.activityLog.create({
      data: {
        leadId,
        userId: currentUserId ?? null,
        type: input.type,
        description: input.description,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return activity;
  }

  async getLeadActivities(leadId: string) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new NotFoundError(`Lead with ID ${leadId} not found`);
    }

    return prisma.activityLog.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const endOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const totalLeads = await prisma.lead.count();
    const totalContacts = await prisma.contact.count();
    const statusGroups = await prisma.lead.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const categoryGroups = await prisma.lead.groupBy({
      by: ['category'],
      _count: { _all: true },
    });
    const totalPendingNextActions = await prisma.lead.count({
      where: { nextActionRequired: { not: null } },
    });
    const overdueNextActions = await prisma.lead.count({
      where: {
        nextActionRequired: { not: null },
        nextActionDueDate: { lt: startOfToday },
      },
    });
    const dueTodayNextActions = await prisma.lead.count({
      where: {
        nextActionRequired: { not: null },
        nextActionDueDate: { gte: startOfToday, lte: endOfToday },
      },
    });
    const upcomingNextActions = await prisma.lead.count({
      where: {
        nextActionRequired: { not: null },
        nextActionDueDate: { gt: endOfToday },
      },
    });
    const noDueDateNextActions = await prisma.lead.count({
      where: {
        nextActionRequired: { not: null },
        nextActionDueDate: null,
      },
    });
    const leadsCreatedToday = await prisma.lead.count({
      where: { createdAt: { gte: startOfToday } },
    });
    const leadsCreatedThisWeek = await prisma.lead.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    // Initialize all enum keys with 0
    const byStatus: Record<LeadStatus, number> = {
      [LeadStatus.NEW]: 0,
      [LeadStatus.CONTACTED]: 0,
      [LeadStatus.REPLIED]: 0,
      [LeadStatus.QUALIFIED]: 0,
      [LeadStatus.LOST]: 0,
      [LeadStatus.CLOSED_WON]: 0,
    };
    for (const group of statusGroups) {
      byStatus[group.status] = group._count._all;
    }

    const byCategory: Record<LeadCategory, number> = {
      [LeadCategory.PROPERTY_BUYER_INVESTOR]: 0,
      [LeadCategory.PROPERTY_SELLER_AGENT]: 0,
      [LeadCategory.STUDY_ABROAD_STUDENT]: 0,
      [LeadCategory.UNIVERSITY_EDUCATION_PARTNER]: 0,
      [LeadCategory.OTHER_BUSINESS]: 0,
    };
    for (const group of categoryGroups) {
      byCategory[group.category] = group._count._all;
    }

    return {
      totals: {
        totalLeads,
        totalContacts,
      },
      byStatus,
      byCategory,
      nextActions: {
        totalPending: totalPendingNextActions,
        overdue: overdueNextActions,
        dueToday: dueTodayNextActions,
        upcoming: upcomingNextActions,
        noDueDate: noDueDateNextActions,
      },
      recentActivity: {
        leadsCreatedToday,
        leadsCreatedThisWeek,
      },
    };
  }
}

export const leadService = new LeadService();
