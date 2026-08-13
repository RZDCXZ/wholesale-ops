import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  Prisma,
  PrismaClient,
  RoleCode,
} from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor, Role } from "../auth/resolve-actor";

const roleOrder: Role[] = ["OWNER", "SALES", "WAREHOUSE", "FINANCE"];
const roleLabels: Record<Role, string> = {
  OWNER: "老板",
  SALES: "销售",
  WAREHOUSE: "仓库",
  FINANCE: "财务",
};

const createAccountInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
  roles: z.array(z.enum(roleOrder)).min(1),
});

const updateAccountRolesInputSchema = z.object({
  accountId: z.string().min(1),
  roles: z.array(z.enum(roleOrder)).min(1),
});

const disableAccountInputSchema = z.object({
  accountId: z.string().min(1),
  confirmed: z.literal(true),
});

export type AccountListItem = {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  roles: Role[];
  lastSessionAt: Date | null;
  createdAt: Date;
};

export type BusinessAuditListItem = {
  id: string;
  actorName: string;
  action: string;
  objectType: string;
  objectId: string;
  occurredAt: Date;
  referenceCode: string | null;
  reason: string | null;
  summary: string | null;
};

export type AccountListPage = {
  items: AccountListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AccountMutationResult = AccountListItem & { auditId: string };

export type BusinessAuditListPage = {
  items: BusinessAuditListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type BusinessAuditFilters = {
  occurredFrom?: Date;
  occurredTo?: Date;
  actor?: string;
  action?: string;
  objectType?: string;
  referenceCode?: string;
};

export type PasswordHasher = (password: string) => Promise<string>;

function assertCapability(
  actor: Actor,
  capability: "ACCOUNTS_MANAGE" | "AUDIT_VIEW",
) {
  if (authorizeCapability(actor, capability).kind !== "authorized") {
    throw new AccountServiceError("FORBIDDEN", "没有访问权限。");
  }
}

function sortRoles(roles: RoleCode[]): Role[] {
  return [...roles].sort(
    (left, right) =>
      roleOrder.indexOf(left as Role) - roleOrder.indexOf(right as Role),
  ) as Role[];
}

function formatRoles(roles: Role[]): string {
  return roles.map((role) => roleLabels[role]).join("、");
}

type AccountRecord = Prisma.UserGetPayload<{
  include: {
    roles: { select: { role: true } };
    sessions: { select: { createdAt: true } };
  };
}>;

function toAccountListItem(user: AccountRecord): AccountListItem {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    enabled: user.enabled,
    roles: sortRoles(user.roles.map(({ role }) => role)),
    lastSessionAt: user.sessions[0]?.createdAt ?? null,
    createdAt: user.createdAt,
  };
}

function accountWhere(filters: {
  query?: string;
  role?: Role;
  enabled?: boolean;
}): Prisma.UserWhereInput {
  const query = filters.query?.trim();

  return {
    enabled: filters.enabled,
    roles: filters.role ? { some: { role: filters.role } } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function auditWhere(filters: BusinessAuditFilters): Prisma.BusinessAuditWhereInput {
  const actor = filters.actor?.trim();
  const referenceCode = filters.referenceCode?.trim();

  return {
    occurredAt:
      filters.occurredFrom || filters.occurredTo
        ? { gte: filters.occurredFrom, lte: filters.occurredTo }
        : undefined,
    actorName: actor
      ? { contains: actor, mode: "insensitive" }
      : undefined,
    action: filters.action || undefined,
    objectType: filters.objectType || undefined,
    referenceCode: referenceCode
      ? { contains: referenceCode, mode: "insensitive" }
      : undefined,
  };
}

function pageMetadata(total: number, page: number, pageSize: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export class AccountServiceError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "ACCOUNT_NOT_FOUND" | "EMAIL_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "AccountServiceError";
  }
}

export async function createAccount(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof createAccountInputSchema>,
  hash: PasswordHasher,
): Promise<AccountMutationResult> {
  assertCapability(actor, "ACCOUNTS_MANAGE");
  const parsed = createAccountInputSchema.parse(input);
  const roles = sortRoles([...new Set(parsed.roles)] as RoleCode[]);
  const passwordHash = await hash(parsed.password);
  const userId = randomUUID();
  const auditId = randomUUID();

  try {
    const user = await database.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          id: userId,
          name: parsed.name,
          email: parsed.email,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: userId,
              providerId: "credential",
              password: passwordHash,
            },
          },
          roles: {
            create: roles.map((role) => ({ role })),
          },
        },
        include: {
          roles: { select: { role: true } },
          sessions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      });

      await transaction.businessAudit.create({
        data: {
          id: auditId,
          actorId: actor.id,
          actorName: actor.name,
          action: "ACCOUNT_CREATED",
          objectType: "ACCOUNT",
          objectId: created.id,
          referenceCode: created.email,
          summary: `创建账号；角色：${formatRoles(roles)}`,
        },
      });

      return created;
    });

    return { ...toAccountListItem(user), auditId };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new AccountServiceError("EMAIL_EXISTS", "邮箱已被其他账号使用。");
    }

    throw error;
  }
}

export async function listAccounts(
  database: PrismaClient,
  actor: Actor,
  filters: { query?: string; role?: Role; enabled?: boolean },
): Promise<AccountListItem[]> {
  assertCapability(actor, "ACCOUNTS_MANAGE");
  const users = await database.user.findMany({
    where: accountWhere(filters),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      roles: { select: { role: true } },
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  return users.map(toAccountListItem);
}

export async function listAccountsPage(
  database: PrismaClient,
  actor: Actor,
  filters: { query?: string; role?: Role; enabled?: boolean },
  pagination: { page: number; pageSize: number },
): Promise<AccountListPage> {
  assertCapability(actor, "ACCOUNTS_MANAGE");
  const page = Math.max(1, pagination.page);
  const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
  const where = accountWhere(filters);
  const [total, users] = await Promise.all([
    database.user.count({ where }),
    database.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        roles: { select: { role: true } },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
  ]);

  return {
    items: users.map(toAccountListItem),
    ...pageMetadata(total, page, pageSize),
  };
}

export async function getAccount(
  database: PrismaClient,
  actor: Actor,
  accountId: string,
): Promise<AccountListItem> {
  assertCapability(actor, "ACCOUNTS_MANAGE");
  const user = await database.user.findUnique({
    where: { id: accountId },
    include: {
      roles: { select: { role: true } },
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  if (!user) {
    throw new AccountServiceError("ACCOUNT_NOT_FOUND", "账号不存在。");
  }

  return toAccountListItem(user);
}

export async function updateAccountRoles(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof updateAccountRolesInputSchema>,
): Promise<AccountMutationResult> {
  assertCapability(actor, "ACCOUNTS_MANAGE");
  const parsed = updateAccountRolesInputSchema.parse(input);
  const roles = sortRoles([...new Set(parsed.roles)] as RoleCode[]);
  const auditId = randomUUID();

  return database.$transaction(async (transaction) => {
    const current = await transaction.user.findUnique({
      where: { id: parsed.accountId },
      select: {
        id: true,
        email: true,
        roles: { select: { role: true } },
      },
    });

    if (!current) {
      throw new AccountServiceError("ACCOUNT_NOT_FOUND", "账号不存在。");
    }

    const previousRoles = sortRoles(current.roles.map(({ role }) => role));
    const updated = await transaction.user.update({
      where: { id: current.id },
      data: {
        roles: {
          deleteMany: {},
          create: roles.map((role) => ({ role })),
        },
      },
      include: {
        roles: { select: { role: true } },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "ACCOUNT_ROLES_UPDATED",
        objectType: "ACCOUNT",
        objectId: updated.id,
        referenceCode: updated.email,
        summary: `角色由 ${formatRoles(previousRoles)} 调整为 ${formatRoles(roles)}`,
      },
    });

    return { ...toAccountListItem(updated), auditId };
  });
}

export async function disableAccount(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof disableAccountInputSchema>,
): Promise<AccountMutationResult> {
  assertCapability(actor, "ACCOUNTS_MANAGE");
  const parsed = disableAccountInputSchema.parse(input);
  const auditId = randomUUID();

  return database.$transaction(async (transaction) => {
    const current = await transaction.user.findUnique({
      where: { id: parsed.accountId },
      select: { id: true, email: true },
    });

    if (!current) {
      throw new AccountServiceError("ACCOUNT_NOT_FOUND", "账号不存在。");
    }

    const revokedSessions = await transaction.session.deleteMany({
      where: { userId: current.id },
    });
    const updated = await transaction.user.update({
      where: { id: current.id },
      data: { enabled: false },
      include: {
        roles: { select: { role: true } },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "ACCOUNT_DISABLED",
        objectType: "ACCOUNT",
        objectId: updated.id,
        referenceCode: updated.email,
        summary: `停用账号并撤销 ${revokedSessions.count} 个会话`,
      },
    });

    return { ...toAccountListItem(updated), auditId };
  });
}

export async function listBusinessAudit(
  database: PrismaClient,
  actor: Actor,
  filters: BusinessAuditFilters,
): Promise<BusinessAuditListItem[]> {
  assertCapability(actor, "AUDIT_VIEW");

  return database.businessAudit.findMany({
    where: auditWhere(filters),
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      actorName: true,
      action: true,
      objectType: true,
      objectId: true,
      occurredAt: true,
      referenceCode: true,
      reason: true,
      summary: true,
    },
  });
}

export async function listBusinessAuditPage(
  database: PrismaClient,
  actor: Actor,
  filters: BusinessAuditFilters,
  pagination: { page: number; pageSize: number },
): Promise<BusinessAuditListPage> {
  assertCapability(actor, "AUDIT_VIEW");
  const page = Math.max(1, pagination.page);
  const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
  const where = auditWhere(filters);
  const select = {
    id: true,
    actorName: true,
    action: true,
    objectType: true,
    objectId: true,
    occurredAt: true,
    referenceCode: true,
    reason: true,
    summary: true,
  } as const;
  const [total, items] = await Promise.all([
    database.businessAudit.count({ where }),
    database.businessAudit.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select,
    }),
  ]);

  return { items, ...pageMetadata(total, page, pageSize) };
}

export async function getBusinessAudit(
  database: PrismaClient,
  actor: Actor,
  auditId: string,
): Promise<BusinessAuditListItem> {
  assertCapability(actor, "AUDIT_VIEW");
  const audit = await database.businessAudit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      actorName: true,
      action: true,
      objectType: true,
      objectId: true,
      occurredAt: true,
      referenceCode: true,
      reason: true,
      summary: true,
    },
  });

  if (!audit) {
    throw new AccountServiceError("ACCOUNT_NOT_FOUND", "业务审计不存在。");
  }

  return audit;
}
