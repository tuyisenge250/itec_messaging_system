import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, UserStatus } from "@/generated/prisma/client";

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  listUsers(params: { search?: string; status?: UserStatus; isPlatformAdmin?: boolean; take: number; cursor?: string }) {
    return prisma.user.findMany({
      where: {
        status: params.status,
        isPlatformAdmin: params.isPlatformAdmin,
        ...(params.search
          ? { OR: [{ email: { contains: params.search, mode: "insensitive" } }, { name: { contains: params.search, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: params.take,
      include: { _count: { select: { memberships: true } } },
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  updateUserStatus(id: string, status: UserStatus) {
    return prisma.user.update({ where: { id }, data: { status } });
  },

  updatePlatformAdminStatus(id: string, isPlatformAdmin: boolean) {
    return prisma.user.update({ where: { id }, data: { isPlatformAdmin } });
  },

  countPlatformAdmins() {
    return prisma.user.count({ where: { isPlatformAdmin: true, status: "ACTIVE" } });
  },

  createUser(data: { email: string; passwordHash: string; name?: string | null }, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return tx.user.create({
      data: { email: data.email.toLowerCase(), passwordHash: data.passwordHash, name: data.name },
    });
  },

  updatePasswordHash(userId: string, passwordHash: string) {
    return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },

  // --- Sessions ---

  createSession(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    return prisma.session.create({ data });
  },

  findSessionByTokenHash(tokenHash: string) {
    return prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  },

  revokeSession(tokenHash: string) {
    return prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllUserSessions(userId: string) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  listActiveSessionsForUser(userId: string) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true, tokenHash: true },
    });
  },

  findSessionById(id: string) {
    return prisma.session.findUnique({ where: { id } });
  },

  revokeSessionById(id: string) {
    return prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  // --- Password reset ---

  createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.passwordResetToken.create({ data });
  },

  findPasswordResetToken(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  consumePasswordResetToken(id: string) {
    return prisma.passwordResetToken.update({ where: { id }, data: { consumedAt: new Date() } });
  },

  // --- Membership / RBAC ---

  findMembership(userId: string, organizationId: string) {
    return prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { role: { include: { permissions: { include: { permission: true } } } }, organization: true },
    });
  },

  listMembershipsForUser(userId: string) {
    return prisma.organizationMembership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { organization: true, role: true },
    });
  },

  /** Looks up a *global* system role (ADMIN, OPERATOR, ...) — organizationId is always null for these. Custom per-organization roles are managed via modules/roles, not this. */
  findRoleByName(name: string) {
    return prisma.role.findFirst({ where: { name, organizationId: null } });
  },

  /** Global system roles only — never leaks another organization's custom role definitions. See modules/roles for org-scoped role listing. */
  listRolesWithPermissions() {
    return prisma.role.findMany({
      where: { organizationId: null },
      orderBy: { name: "asc" },
      include: { permissions: { include: { permission: true } } },
    });
  },
};
