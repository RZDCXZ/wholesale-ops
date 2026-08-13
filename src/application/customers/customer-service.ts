import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";

const createCustomerInputSchema = z.object({
  customerCode: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(500),
  responsibleSalesId: z.string().min(1).optional(),
  paymentTermDays: z.number().int().nonnegative().max(2_147_483_647),
  enabled: z.boolean(),
});
const updateCustomerInputSchema = createCustomerInputSchema
  .omit({ customerCode: true, responsibleSalesId: true, enabled: true })
  .extend({ customerId: z.string().min(1) });
const reassignCustomerInputSchema = z.object({
  customerId: z.string().min(1),
  responsibleSalesId: z.string().min(1),
  confirmed: z.literal(true),
});
const confirmedCustomerInputSchema = z.object({
  customerId: z.string().min(1),
  confirmed: z.literal(true),
});

export type CustomerListItem = {
  id: string;
  customerCode: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  responsibleSales: { id: string; name: string };
  paymentTermDays: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};
export type CustomerDetail = CustomerListItem & {
  hasBusinessReferences: boolean;
};

export type CustomerMutationResult = CustomerListItem & { auditId: string };
export type CustomerFilters = {
  query?: string;
  responsibleSalesId?: string;
  enabled?: boolean;
};
export type CustomerSortField =
  | "customerCode"
  | "name"
  | "responsibleSales"
  | "paymentTermDays"
  | "updatedAt";
export type CustomerListPage = {
  items: CustomerListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type ResponsibleSalesOption = { id: string; name: string };
export type CustomerResponsibleOption = ResponsibleSalesOption & {
  enabled: boolean;
};
export type CustomerPermissions = {
  hasGlobalReadScope: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canReassign: boolean;
  canDisable: boolean;
  canDelete: boolean;
};

export class CustomerServiceError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "CUSTOMER_CODE_EXISTS"
      | "CUSTOMER_CODE_IMMUTABLE"
      | "CUSTOMER_NOT_FOUND"
      | "INVALID_RESPONSIBLE_SALES"
      | "INVALID_PAYMENT_TERM"
      | "RESPONSIBLE_SALES_REQUIRES_ACTION"
      | "CUSTOMER_STATUS_REQUIRES_ACTION"
      | "CUSTOMER_REFERENCED",
    message: string,
  ) {
    super(message);
    this.name = "CustomerServiceError";
  }
}

function assertCapability(
  actor: Actor,
  capability: "CUSTOMERS_VIEW" | "CUSTOMERS_MANAGE",
) {
  if (authorizeCapability(actor, capability).kind !== "authorized") {
    throw new CustomerServiceError("FORBIDDEN", "没有访问权限。");
  }
}

function hasRole(actor: Actor, role: "OWNER" | "SALES" | "FINANCE"): boolean {
  return actor.roles.includes(role);
}

export function getCustomerPermissions(
  actor: Actor,
  customer?: Pick<CustomerListItem, "responsibleSales">,
): CustomerPermissions {
  const isOwner = hasRole(actor, "OWNER");
  const isSales = hasRole(actor, "SALES");
  const isResponsibleSales = customer
    ? isSales && customer.responsibleSales.id === actor.id
    : isSales;

  return {
    hasGlobalReadScope: isOwner || hasRole(actor, "FINANCE"),
    canCreate: isOwner || isSales,
    canEdit: isOwner || isResponsibleSales,
    canReassign: isOwner,
    canDisable: isOwner || isResponsibleSales,
    canDelete: isOwner,
  };
}

function customerReadScope(actor: Actor): Prisma.CustomerWhereInput {
  return hasRole(actor, "OWNER") || hasRole(actor, "FINANCE")
    ? {}
    : { responsibleSalesId: actor.id };
}

function customerManagementScope(actor: Actor): Prisma.CustomerWhereInput {
  return hasRole(actor, "OWNER") ? {} : { responsibleSalesId: actor.id };
}

function customerWhere(
  actor: Actor,
  filters: CustomerFilters,
): Prisma.CustomerWhereInput {
  const query = filters.query?.trim();
  return {
    AND: [
      customerReadScope(actor),
      { responsibleSalesId: filters.responsibleSalesId },
      { enabled: filters.enabled },
    ],
    OR: query
      ? [
          { customerCode: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
}

function customerOrderBy(
  sort: CustomerSortField = "updatedAt",
  direction: Prisma.SortOrder = "desc",
): Prisma.CustomerOrderByWithRelationInput[] {
  if (sort === "responsibleSales") {
    return [{ responsibleSales: { name: direction } }, { id: "asc" }];
  }
  return [{ [sort]: direction }, { id: "asc" }];
}

type CustomerRecord = Prisma.CustomerGetPayload<{
  include: { responsibleSales: { select: { id: true; name: true } } };
}>;

function toCustomerListItem(customer: CustomerRecord): CustomerListItem {
  return customer;
}

async function resolveResponsibleSalesId(
  database: PrismaClient | Prisma.TransactionClient,
  actor: Actor,
  requestedId?: string,
): Promise<string> {
  const responsibleSalesId = hasRole(actor, "OWNER") ? requestedId : actor.id;
  if (!responsibleSalesId) {
    throw new CustomerServiceError(
      "INVALID_RESPONSIBLE_SALES",
      "请选择一名启用的销售账号作为客户负责人。",
    );
  }

  const responsibleSales = await database.user.findFirst({
    where: {
      id: responsibleSalesId,
      enabled: true,
      roles: { some: { role: "SALES" } },
    },
    select: { id: true },
  });
  if (!responsibleSales) {
    throw new CustomerServiceError(
      "INVALID_RESPONSIBLE_SALES",
      "客户负责人必须是启用的销售账号。",
    );
  }

  return responsibleSales.id;
}

export async function createCustomer(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof createCustomerInputSchema>,
): Promise<CustomerMutationResult> {
  assertCapability(actor, "CUSTOMERS_MANAGE");
  const validation = createCustomerInputSchema.safeParse(input);
  if (!validation.success) {
    if (validation.error.issues.some(({ path }) => path[0] === "paymentTermDays")) {
      throw new CustomerServiceError(
        "INVALID_PAYMENT_TERM",
        "默认账期必须是现结或非负整数天数。",
      );
    }
    throw validation.error;
  }

  const parsed = validation.data;
  const customerId = randomUUID();
  const auditId = randomUUID();

  try {
    const customer = await database.$transaction(async (transaction) => {
      const responsibleSalesId = await resolveResponsibleSalesId(
        transaction,
        actor,
        parsed.responsibleSalesId,
      );
      const created = await transaction.customer.create({
        data: {
          id: customerId,
          customerCode: parsed.customerCode,
          name: parsed.name,
          contactName: parsed.contactName,
          phone: parsed.phone,
          address: parsed.address,
          responsibleSalesId,
          paymentTermDays: parsed.paymentTermDays,
          enabled: parsed.enabled,
        },
        include: {
          responsibleSales: { select: { id: true, name: true } },
        },
      });

      await transaction.businessAudit.create({
        data: {
          id: auditId,
          actorId: actor.id,
          actorName: actor.name,
          action: "CUSTOMER_CREATED",
          objectType: "CUSTOMER",
          objectId: created.id,
          referenceCode: created.customerCode,
          summary: `创建客户：${created.name}`,
        },
      });

      return created;
    });

    return { ...toCustomerListItem(customer), auditId };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new CustomerServiceError(
        "CUSTOMER_CODE_EXISTS",
        "客户编码已被使用。",
      );
    }
    throw error;
  }
}

export async function listCustomers(
  database: PrismaClient,
  actor: Actor,
  filters: CustomerFilters,
): Promise<CustomerListItem[]> {
  assertCapability(actor, "CUSTOMERS_VIEW");
  const customers = await database.customer.findMany({
    where: customerWhere(actor, filters),
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    include: { responsibleSales: { select: { id: true, name: true } } },
  });

  return customers.map(toCustomerListItem);
}

export async function listCustomersPage(
  database: PrismaClient,
  actor: Actor,
  filters: CustomerFilters,
  pagination: {
    page: number;
    pageSize: number;
    sort?: CustomerSortField;
    direction?: Prisma.SortOrder;
  },
): Promise<CustomerListPage> {
  assertCapability(actor, "CUSTOMERS_VIEW");
  const page = Math.max(1, pagination.page);
  const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
  const where = customerWhere(actor, filters);
  const [total, customers] = await Promise.all([
    database.customer.count({ where }),
    database.customer.findMany({
      where,
      orderBy: customerOrderBy(pagination.sort, pagination.direction),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { responsibleSales: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    items: customers.map(toCustomerListItem),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listResponsibleSalesOptions(
  database: PrismaClient,
  actor: Actor,
): Promise<ResponsibleSalesOption[]> {
  assertCapability(actor, "CUSTOMERS_VIEW");
  const users = await database.user.findMany({
    where: {
      id: hasRole(actor, "OWNER") || hasRole(actor, "FINANCE") ? undefined : actor.id,
      enabled: true,
      roles: { some: { role: "SALES" } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  return users;
}

export async function listCustomerResponsibleOptions(
  database: PrismaClient,
  actor: Actor,
): Promise<CustomerResponsibleOption[]> {
  assertCapability(actor, "CUSTOMERS_VIEW");
  return database.user.findMany({
    where: {
      responsibleCustomers: { some: customerReadScope(actor) },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, enabled: true },
  });
}

export async function getCustomer(
  database: PrismaClient,
  actor: Actor,
  customerId: string,
): Promise<CustomerDetail> {
  assertCapability(actor, "CUSTOMERS_VIEW");
  const customer = await database.customer.findFirst({
    where: { AND: [{ id: customerId }, customerReadScope(actor)] },
    include: { responsibleSales: { select: { id: true, name: true } } },
  });
  if (!customer) {
    throw new CustomerServiceError(
      "CUSTOMER_NOT_FOUND",
      "客户不存在或不可访问。",
    );
  }

  return {
    ...toCustomerListItem(customer),
    hasBusinessReferences: await customerHasBusinessReferences(
      database,
      customer.id,
    ),
  };
}

export async function getCustomerForManagement(
  database: PrismaClient,
  actor: Actor,
  customerId: string,
): Promise<CustomerDetail> {
  assertCapability(actor, "CUSTOMERS_MANAGE");
  const customer = await getCustomer(database, actor, customerId);
  if (
    !hasRole(actor, "OWNER") &&
    customer.responsibleSales.id !== actor.id
  ) {
    throw new CustomerServiceError(
      "CUSTOMER_NOT_FOUND",
      "客户不存在或不可访问。",
    );
  }
  return customer;
}

async function customerHasBusinessReferences(
  database: PrismaClient | Prisma.TransactionClient,
  customerId: string,
): Promise<boolean> {
  const rows = await database.$queryRaw<Array<{ referenced: boolean }>>`
    SELECT customer_has_business_references(${customerId}) AS referenced
  `;
  return rows[0]?.referenced ?? false;
}

export async function updateCustomer(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof updateCustomerInputSchema>,
): Promise<CustomerMutationResult> {
  assertCapability(actor, "CUSTOMERS_MANAGE");
  if (typeof input === "object" && input !== null && "customerCode" in input) {
    throw new CustomerServiceError(
      "CUSTOMER_CODE_IMMUTABLE",
      "客户编码创建后不能修改。",
    );
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "responsibleSalesId" in input
  ) {
    throw new CustomerServiceError(
      "RESPONSIBLE_SALES_REQUIRES_ACTION",
      "请使用专门的负责人调整操作转交客户。",
    );
  }
  if (typeof input === "object" && input !== null && "enabled" in input) {
    throw new CustomerServiceError(
      "CUSTOMER_STATUS_REQUIRES_ACTION",
      "请使用专门的停用操作变更客户状态。",
    );
  }
  const validation = updateCustomerInputSchema.safeParse(input);
  if (!validation.success) {
    if (validation.error.issues.some(({ path }) => path[0] === "paymentTermDays")) {
      throw new CustomerServiceError(
        "INVALID_PAYMENT_TERM",
        "默认账期必须是现结或非负整数天数。",
      );
    }
    throw validation.error;
  }
  const parsed = validation.data;
  const auditId = randomUUID();

  const customer = await database.$transaction(async (transaction) => {
    const updatedCount = await transaction.customer.updateMany({
      where: {
        AND: [{ id: parsed.customerId }, customerManagementScope(actor)],
      },
      data: {
        name: parsed.name,
        contactName: parsed.contactName,
        phone: parsed.phone,
        address: parsed.address,
        paymentTermDays: parsed.paymentTermDays,
      },
    });
    if (updatedCount.count === 0) {
      throw new CustomerServiceError(
        "CUSTOMER_NOT_FOUND",
        "客户不存在或不可访问。",
      );
    }
    const updated = await transaction.customer.findUniqueOrThrow({
      where: { id: parsed.customerId },
      include: { responsibleSales: { select: { id: true, name: true } } },
    });
    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "CUSTOMER_UPDATED",
        objectType: "CUSTOMER",
        objectId: updated.id,
        referenceCode: updated.customerCode,
        summary: `更新客户资料：${updated.name}`,
      },
    });

    return updated;
  });

  return { ...toCustomerListItem(customer), auditId };
}

export async function reassignCustomer(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof reassignCustomerInputSchema>,
): Promise<CustomerMutationResult> {
  assertCapability(actor, "CUSTOMERS_MANAGE");
  if (!hasRole(actor, "OWNER")) {
    throw new CustomerServiceError("FORBIDDEN", "没有访问权限。");
  }
  const parsed = reassignCustomerInputSchema.parse(input);
  const auditId = randomUUID();

  const customer = await database.$transaction(async (transaction) => {
    const currentRows = await transaction.$queryRaw<
      Array<{
        id: string;
        customerCode: string;
        responsibleSalesName: string;
      }>
    >`
      SELECT
        customer."id",
        customer."customerCode",
        responsible_sales."name" AS "responsibleSalesName"
      FROM "customer" AS customer
      JOIN "user" AS responsible_sales
        ON responsible_sales."id" = customer."responsibleSalesId"
      WHERE customer."id" = ${parsed.customerId}
      FOR UPDATE OF customer
    `;
    const current = currentRows[0];
    if (!current) {
      throw new CustomerServiceError(
        "CUSTOMER_NOT_FOUND",
        "客户不存在或不可访问。",
      );
    }
    const responsibleSalesId = await resolveResponsibleSalesId(
      transaction,
      actor,
      parsed.responsibleSalesId,
    );
    const updated = await transaction.customer.update({
      where: { id: current.id },
      data: { responsibleSalesId },
      include: { responsibleSales: { select: { id: true, name: true } } },
    });
    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "CUSTOMER_RESPONSIBLE_SALES_CHANGED",
        objectType: "CUSTOMER",
        objectId: updated.id,
        referenceCode: updated.customerCode,
        summary: `客户负责人由「${current.responsibleSalesName}」调整为「${updated.responsibleSales.name}」`,
      },
    });

    return updated;
  });

  return { ...toCustomerListItem(customer), auditId };
}

export async function disableCustomer(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof confirmedCustomerInputSchema>,
): Promise<CustomerMutationResult> {
  assertCapability(actor, "CUSTOMERS_MANAGE");
  const parsed = confirmedCustomerInputSchema.parse(input);
  const auditId = randomUUID();

  const customer = await database.$transaction(async (transaction) => {
    const updatedCount = await transaction.customer.updateMany({
      where: {
        AND: [{ id: parsed.customerId }, customerManagementScope(actor)],
      },
      data: { enabled: false },
    });
    if (updatedCount.count === 0) {
      throw new CustomerServiceError(
        "CUSTOMER_NOT_FOUND",
        "客户不存在或不可访问。",
      );
    }
    const updated = await transaction.customer.findUniqueOrThrow({
      where: { id: parsed.customerId },
      include: { responsibleSales: { select: { id: true, name: true } } },
    });
    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "CUSTOMER_DISABLED",
        objectType: "CUSTOMER",
        objectId: updated.id,
        referenceCode: updated.customerCode,
        summary: `停用客户：${updated.name}`,
      },
    });

    return updated;
  });

  return { ...toCustomerListItem(customer), auditId };
}

export async function deleteCustomer(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof confirmedCustomerInputSchema>,
): Promise<{ id: string; customerCode: string; auditId: string }> {
  assertCapability(actor, "CUSTOMERS_MANAGE");
  if (!hasRole(actor, "OWNER")) {
    throw new CustomerServiceError("FORBIDDEN", "没有访问权限。");
  }
  const parsed = confirmedCustomerInputSchema.parse(input);
  const auditId = randomUUID();

  return database.$transaction(async (transaction) => {
    const customer = await transaction.customer.findUnique({
      where: { id: parsed.customerId },
    });
    if (!customer) {
      throw new CustomerServiceError(
        "CUSTOMER_NOT_FOUND",
        "客户不存在或不可访问。",
      );
    }
    if (await customerHasBusinessReferences(transaction, customer.id)) {
      throw new CustomerServiceError(
        "CUSTOMER_REFERENCED",
        "客户已被业务记录引用，不能删除；请改为停用。",
      );
    }

    await transaction.customer.delete({ where: { id: customer.id } });
    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "CUSTOMER_DELETED",
        objectType: "CUSTOMER",
        objectId: customer.id,
        referenceCode: customer.customerCode,
        summary: `删除未引用客户：${customer.name}`,
      },
    });

    return { id: customer.id, customerCode: customer.customerCode, auditId };
  });
}
