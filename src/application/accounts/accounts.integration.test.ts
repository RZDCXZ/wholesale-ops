import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "../auth/resolve-actor";
import {
  AccountServiceError,
  createAccount,
  disableAccount,
  listAccounts,
  listBusinessAudit,
  updateAccountRoles,
} from "./account-service";
import { PrismaClient } from "../../generated/prisma/client";

const execFileAsync = promisify(execFile);

const owner: Actor = {
  id: "owner-user",
  name: "张伟",
  email: "owner@example.local",
  roles: ["OWNER"],
};

describe("账号管理与业务审计", () => {
  let container: StartedTestContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({
        POSTGRES_DB: "wholesale_ops_test",
        POSTGRES_USER: "wholesale_ops",
        POSTGRES_PASSWORD: "wholesale_ops",
      })
      .withExposedPorts(5432)
      .start();

    const databaseUrl = `postgresql://wholesale_ops:wholesale_ops@${container.getHost()}:${container.getMappedPort(5432)}/wholesale_ops_test?schema=public`;

    await execFileAsync("pnpm", ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "business_audit", "session", "account", "user_role", "user" CASCADE',
    );
    await prisma.user.create({
      data: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        roles: { create: { role: "OWNER" } },
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("老板创建多角色账号后可从账号列表和业务审计列表读取结果", async () => {
    const account = await createAccount(
      prisma,
      owner,
      {
        name: "赵磊",
        email: "multi@example.local",
        password: "demo123456",
        roles: ["SALES", "WAREHOUSE"],
      },
      hashPassword,
    );

    expect(account).toMatchObject({
      name: "赵磊",
      email: "multi@example.local",
      enabled: true,
      roles: ["SALES", "WAREHOUSE"],
    });

    await expect(listAccounts(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({
        id: account.id,
        email: "multi@example.local",
        roles: ["SALES", "WAREHOUSE"],
      }),
      expect.objectContaining({
        id: owner.id,
        email: owner.email,
        roles: ["OWNER"],
      }),
    ]);

    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({
        actorName: "张伟",
        action: "ACCOUNT_CREATED",
        objectType: "ACCOUNT",
        objectId: account.id,
        referenceCode: "multi@example.local",
      }),
    ]);
  });

  it("老板调整账号角色后权限并集和审计摘要同时更新", async () => {
    const account = await createAccount(
      prisma,
      owner,
      {
        name: "赵磊",
        email: "multi@example.local",
        password: "demo123456",
        roles: ["SALES"],
      },
      hashPassword,
    );

    await expect(
      updateAccountRoles(prisma, owner, {
        accountId: account.id,
        roles: ["SALES", "WAREHOUSE"],
      }),
    ).resolves.toMatchObject({ roles: ["SALES", "WAREHOUSE"] });

    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({
        action: "ACCOUNT_ROLES_UPDATED",
        objectId: account.id,
        summary: "角色由 销售 调整为 销售、仓库",
      }),
      expect.objectContaining({
        action: "ACCOUNT_CREATED",
        objectId: account.id,
      }),
    ]);
  });

  it("老板确认停用账号后已有会话失效并留下审计", async () => {
    const account = await createAccount(
      prisma,
      owner,
      {
        name: "刘芳",
        email: "finance@example.local",
        password: "demo123456",
        roles: ["FINANCE"],
      },
      hashPassword,
    );
    await prisma.session.create({
      data: {
        id: "finance-session",
        token: "finance-session-token",
        userId: account.id,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });

    await expect(
      disableAccount(prisma, owner, {
        accountId: account.id,
        confirmed: true,
      }),
    ).resolves.toMatchObject({
      id: account.id,
      enabled: false,
      lastSessionAt: null,
    });

    await expect(
      listAccounts(prisma, owner, { enabled: false }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: account.id,
        email: "finance@example.local",
        enabled: false,
        lastSessionAt: null,
      }),
    ]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({
        action: "ACCOUNT_DISABLED",
        objectId: account.id,
        summary: "停用账号并撤销 1 个会话",
      }),
      expect.objectContaining({ action: "ACCOUNT_CREATED" }),
    ]);
  });

  it("老板可以按姓名或邮箱、角色和启用状态组合筛选账号", async () => {
    await createAccount(
      prisma,
      owner,
      {
        name: "陈敏",
        email: "sales@example.local",
        password: "demo123456",
        roles: ["SALES"],
      },
      hashPassword,
    );
    const disabled = await createAccount(
      prisma,
      owner,
      {
        name: "赵磊",
        email: "multi@example.local",
        password: "demo123456",
        roles: ["SALES", "WAREHOUSE"],
      },
      hashPassword,
    );
    await disableAccount(prisma, owner, {
      accountId: disabled.id,
      confirmed: true,
    });

    await expect(
      listAccounts(prisma, owner, {
        query: "multi@",
        role: "WAREHOUSE",
        enabled: false,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: disabled.id, name: "赵磊" }),
    ]);
    await expect(
      listAccounts(prisma, owner, { query: "陈敏", enabled: true }),
    ).resolves.toEqual([
      expect.objectContaining({ name: "陈敏", email: "sales@example.local" }),
    ]);
  });

  it.each(["SALES", "WAREHOUSE", "FINANCE"] as const)(
    "%s 直接调用账号管理服务时得到不泄露资源的权限错误",
    async (role) => {
      const nonOwner: Actor = {
        id: `${role.toLowerCase()}-user`,
        name: "非老板",
        email: `${role.toLowerCase()}@example.local`,
        roles: [role],
      };

      await expect(listAccounts(prisma, nonOwner, {})).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "没有访问权限。",
      } satisfies Partial<AccountServiceError>);
      await expect(listBusinessAudit(prisma, nonOwner, {})).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "没有访问权限。",
      } satisfies Partial<AccountServiceError>);
    },
  );

  it("账号创建、角色调整和停用在审计写入失败时全部回滚", async () => {
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_business_audit_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced audit failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_business_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION reject_business_audit_insert();
    `);

    await expect(
      createAccount(
        prisma,
        owner,
        {
          name: "创建失败账号",
          email: "create-failed@example.local",
          password: "demo123456",
          roles: ["SALES"],
        },
        hashPassword,
      ),
    ).rejects.toThrow("forced audit failure");
    await expect(listAccounts(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({ id: owner.id }),
    ]);

    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_business_audit_insert ON "business_audit"',
    );
    const target = await createAccount(
      prisma,
      owner,
      {
        name: "原子性账号",
        email: "atomic@example.local",
        password: "demo123456",
        roles: ["SALES"],
      },
      hashPassword,
    );
    await prisma.session.create({
      data: {
        id: "atomic-session",
        token: "atomic-session-token",
        userId: target.id,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_business_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION reject_business_audit_insert();
    `);

    await expect(
      updateAccountRoles(prisma, owner, {
        accountId: target.id,
        roles: ["FINANCE"],
      }),
    ).rejects.toThrow("forced audit failure");
    await expect(
      disableAccount(prisma, owner, {
        accountId: target.id,
        confirmed: true,
      }),
    ).rejects.toThrow("forced audit failure");

    await expect(listAccounts(prisma, owner, { query: "atomic@" })).resolves.toEqual([
      expect.objectContaining({
        id: target.id,
        enabled: true,
        roles: ["SALES"],
        lastSessionAt: expect.any(Date),
      }),
    ]);

    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_business_audit_insert ON "business_audit"',
    );
    await prisma.$executeRawUnsafe("DROP FUNCTION reject_business_audit_insert() ");
  });

  it("业务审计记录在数据库中不能编辑或删除", async () => {
    await createAccount(
      prisma,
      owner,
      {
        name: "陈敏",
        email: "sales@example.local",
        password: "demo123456",
        roles: ["SALES"],
      },
      hashPassword,
    );

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "business_audit" SET "summary" = '篡改' WHERE "action" = 'ACCOUNT_CREATED'`,
      ),
    ).rejects.toThrow("business_audit is append-only");
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM "business_audit" WHERE "action" = 'ACCOUNT_CREATED'`,
      ),
    ).rejects.toThrow("business_audit is append-only");
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toHaveLength(1);
  });
});
