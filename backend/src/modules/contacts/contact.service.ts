import { prisma } from '../../config/database.js';
import { NotFoundError, ConflictError } from '../../common/errors/app-error.js';
import {
  CreateContactInput,
  UpdateContactInput,
  ContactQueryInput,
} from './contact.schemas.js';
import {
  parsePaginationParams,
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/utils/pagination.util.js';
import { Contact, Prisma } from '@prisma/client';

export interface PaginatedContacts {
  contacts: Contact[];
  meta: PaginationMeta;
}

export class ContactService {
  async listContacts(query: ContactQueryInput): Promise<PaginatedContacts> {
    const { page, limit, skip, take } = parsePaginationParams(query);

    const where: Prisma.ContactWhereInput = {};

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { primaryEmail: { contains: search, mode: 'insensitive' } },
        { primaryPhone: { contains: search } },
        { instagramHandle: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      contacts,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async getContactById(id: string) {
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        leads: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
        conversations: {
          orderBy: { lastMessageAt: 'desc' },
          select: {
            id: true,
            channel: true,
            channelThreadId: true,
            lastMessageAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!contact) {
      throw new NotFoundError(`Contact with ID ${id} not found`);
    }

    return contact;
  }

  async createContact(input: CreateContactInput): Promise<Contact> {
    const email = input.primaryEmail ? input.primaryEmail.trim().toLowerCase() : null;
    const phone = input.primaryPhone ? input.primaryPhone.trim() : null;
    const instagramHandle = input.instagramHandle ? input.instagramHandle.trim() : null;

    if (email) {
      const existingEmail = await prisma.contact.findUnique({
        where: { primaryEmail: email },
      });
      if (existingEmail) {
        throw new ConflictError(`Contact with email ${email} already exists`);
      }
    }

    if (phone) {
      const existingPhone = await prisma.contact.findFirst({
        where: { primaryPhone: phone },
      });
      if (existingPhone) {
        throw new ConflictError(`Contact with phone ${phone} already exists`);
      }
    }

    if (instagramHandle) {
      const existingHandle = await prisma.contact.findFirst({
        where: {
          instagramHandle: {
            equals: instagramHandle,
            mode: 'insensitive',
          },
        },
      });
      if (existingHandle) {
        throw new ConflictError(`Contact with Instagram handle ${instagramHandle} already exists`);
      }
    }

    const contact = await prisma.contact.create({
      data: {
        name: input.name,
        primaryEmail: email,
        primaryPhone: phone,
        instagramHandle,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });

    return contact;
  }

  async updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
    const existing = await prisma.contact.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError(`Contact with ID ${id} not found`);
    }

    const email =
      input.primaryEmail !== undefined
        ? input.primaryEmail
          ? input.primaryEmail.trim().toLowerCase()
          : null
        : undefined;

    if (email && email !== existing.primaryEmail) {
      const duplicateEmail = await prisma.contact.findUnique({
        where: { primaryEmail: email },
      });
      if (duplicateEmail) {
        throw new ConflictError(`Contact with email ${email} already exists`);
      }
    }

    const phone =
      input.primaryPhone !== undefined
        ? input.primaryPhone
          ? input.primaryPhone.trim()
          : null
        : undefined;

    if (phone && phone !== existing.primaryPhone) {
      const duplicatePhone = await prisma.contact.findFirst({
        where: {
          primaryPhone: phone,
          id: { not: id },
        },
      });
      if (duplicatePhone) {
        throw new ConflictError(`Contact with phone ${phone} already exists`);
      }
    }

    const instagramHandle =
      input.instagramHandle !== undefined
        ? input.instagramHandle
          ? input.instagramHandle.trim()
          : null
        : undefined;

    if (
      instagramHandle &&
      (!existing.instagramHandle ||
        instagramHandle.toLowerCase() !== existing.instagramHandle.toLowerCase())
    ) {
      const duplicateHandle = await prisma.contact.findFirst({
        where: {
          instagramHandle: {
            equals: instagramHandle,
            mode: 'insensitive',
          },
          id: { not: id },
        },
      });
      if (duplicateHandle) {
        throw new ConflictError(`Contact with Instagram handle ${instagramHandle} already exists`);
      }
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(email !== undefined && { primaryEmail: email }),
        ...(phone !== undefined && { primaryPhone: phone }),
        ...(instagramHandle !== undefined && { instagramHandle }),
        ...(input.metadata !== undefined && {
          metadata: input.metadata as Prisma.InputJsonValue,
        }),
      },
    });

    return updated;
  }
}

export const contactService = new ContactService();
