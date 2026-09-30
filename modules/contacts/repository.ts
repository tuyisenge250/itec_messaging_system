import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const contactRepository = {
  create(data: Prisma.ContactCreateInput) {
    return prisma.contact.create({ data });
  },

  findById(id: string) {
    return prisma.contact.findUnique({ where: { id } });
  },

  update(id: string, data: Prisma.ContactUpdateInput) {
    return prisma.contact.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.contact.delete({ where: { id } });
  },

  list(organizationId: string, params: { take: number; cursor?: string }) {
    return prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  /**
   * `skipDuplicates` relies on the existing `@@unique([organizationId,
   * phoneNormalized])` constraint — a re-imported phone number is silently
   * skipped rather than erroring, which is the right behavior for a CSV that
   * may legitimately be re-uploaded. `createMany` doesn't return the created
   * rows, so the caller re-queries by phone number when it needs ids (e.g.
   * to assign a group).
   */
  createManyIgnoringDuplicates(rows: Prisma.ContactCreateManyInput[]) {
    return prisma.contact.createMany({ data: rows, skipDuplicates: true });
  },

  findByPhoneNumbers(organizationId: string, phoneNormalized: string[]) {
    return prisma.contact.findMany({ where: { organizationId, phoneNormalized: { in: phoneNormalized } } });
  },

  // --- Groups ---

  createGroup(data: Prisma.ContactGroupCreateInput) {
    return prisma.contactGroup.create({ data });
  },

  listGroups(organizationId: string) {
    return prisma.contactGroup.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  },

  findGroupById(id: string) {
    return prisma.contactGroup.findUnique({ where: { id } });
  },

  deleteGroup(id: string) {
    return prisma.contactGroup.delete({ where: { id } });
  },

  addToGroup(contactGroupId: string, contactId: string) {
    return prisma.contactGroupMember.upsert({
      where: { contactGroupId_contactId: { contactGroupId, contactId } },
      create: { contactGroupId, contactId },
      update: {},
    });
  },

  removeFromGroup(contactGroupId: string, contactId: string) {
    return prisma.contactGroupMember.deleteMany({ where: { contactGroupId, contactId } });
  },

  listGroupMembers(contactGroupId: string) {
    return prisma.contactGroupMember.findMany({
      where: { contactGroupId },
      include: { contact: true },
    });
  },
};
