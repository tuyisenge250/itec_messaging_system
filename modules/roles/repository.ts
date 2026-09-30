import { prisma } from "@/infrastructure/database/prisma";

const withPermissions = { permissions: { include: { permission: true } } } as const;

export const rolesRepository = {
  listGlobal() {
    return prisma.role.findMany({ where: { organizationId: null }, orderBy: { name: "asc" }, include: withPermissions });
  },

  listForOrganization(organizationId: string) {
    return prisma.role.findMany({ where: { organizationId }, orderBy: { name: "asc" }, include: withPermissions });
  },

  findById(id: string) {
    return prisma.role.findUnique({ where: { id }, include: withPermissions });
  },

  countMembersUsingRole(roleId: string) {
    return prisma.organizationMembership.count({ where: { roleId, status: "ACTIVE" } });
  },

  async create(data: { organizationId: string; name: string; description?: string; createdByUserId: string; permissionIds: string[] }) {
    return prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        organizationId: data.organizationId,
        createdByUserId: data.createdByUserId,
        isSystem: false,
        permissions: { create: data.permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: withPermissions,
    });
  },

  async update(id: string, data: { name?: string; description?: string; permissionIds?: string[] }) {
    return prisma.$transaction(async (tx) => {
      if (data.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: data.permissionIds.map((permissionId) => ({ roleId: id, permissionId })) });
      }
      return tx.role.update({
        where: { id },
        data: { name: data.name, description: data.description },
        include: withPermissions,
      });
    });
  },

  delete(id: string) {
    return prisma.role.delete({ where: { id } });
  },

  findPermissionsByCodes(codes: string[]) {
    return prisma.permission.findMany({ where: { code: { in: codes } } });
  },
};
