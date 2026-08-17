import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import "dotenv/config";

import { PrismaClient, RoleCode } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for boundary E2E tests.");
}

async function signIn(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function switchSession(page: Page, email: string) {
  const result = await page.evaluate(
    async ({ nextEmail, nextPassword }) => {
      const signOutResponse = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: nextEmail, password: nextPassword }),
      });
      const sessionResponse = await fetch("/api/auth/get-session");
      const session = (await sessionResponse.json()) as {
        user?: { email?: string };
      };
      return {
        signOutOk: signOutResponse.ok,
        signInOk: response.ok,
        status: response.status,
        email: session.user?.email,
      };
    },
    { nextEmail: email, nextPassword: password },
  );

  expect(result).toEqual({
    signOutOk: true,
    signInOk: true,
    status: 200,
    email,
  });
}

async function multiAccountEditHref(page: Page) {
  const href = await page
    .getByRole("row")
    .filter({ hasText: "multi@example.local" })
    .getByRole("link", { name: "编辑角色" })
    .getAttribute("href");

  expect(href).toBeTruthy();
  return href!;
}

test("停用账号经过真实 Better Auth 登录入口时不能创建会话", async ({ page }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  const userId = randomUUID();
  const email = `disabled-${userId}@example.local`;

  try {
    await prisma.user.create({
      data: {
        id: userId,
        name: "停用边界测试",
        email,
        enabled: false,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: userId,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
        roles: { create: { role: RoleCode.SALES } },
      },
    });

    await page.goto("/login");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByText("邮箱或密码不正确，请检查后重试。", { exact: true }),
    ).toBeVisible();
    await expect(prisma.session.count({ where: { userId } })).resolves.toBe(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

test("非老板不能绕过账号服务调用 Better Auth 更新用户入口", async ({ page }) => {
  await signIn(page, "sales@example.local", /\/sales-orders$/);

  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/update-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "越权改名" }),
    });
    return { status: response.status, body: await response.json() };
  });

  expect(result).toEqual({
    status: 403,
    body: { code: "FORBIDDEN", message: "Forbidden" },
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /陈敏/ })).toBeVisible();
  await expect(page.getByText("越权改名", { exact: true })).toHaveCount(0);
});

test("账号确认对话框管理焦点且列表允许切换每页条数", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/settings/accounts");
  const pageSize = page.getByLabel("每页条数");
  await expect(pageSize).toContainText("每页 20 条");
  await pageSize.click();
  const pageSizeListbox = page.getByRole("listbox").filter({ visible: true });
  await expect(pageSizeListbox.getByRole("option")).toHaveCount(3);
  await pageSizeListbox.getByRole("option", { name: "每页 50 条" }).click();
  await expect(pageSize).toContainText("每页 50 条");
  await page.getByRole("button", { name: "筛选" }).click();
  await expect(page).toHaveURL(/size=50/);

  const disableButton = page
    .getByRole("row")
    .filter({ hasText: "multi@example.local" })
    .getByRole("button", { name: "停用" });
  await disableButton.click();
  await expect(page.getByRole("dialog", { name: "停用账号" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "停用账号" })).toHaveCount(0);
  await expect(disableButton).toBeFocused();
});

test("账号表单修改后从工作区导航离开需要确认", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/settings/accounts/new");
  await page.getByLabel("姓名").fill("尚未保存");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\/accounts\/new$/);

  await page.getByRole("button", { name: /张伟/ }).click();
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/settings\/accounts\/new$/);

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "销售单" }).click();
  await expect(page).toHaveURL(/\/settings\/accounts\/new$/);

  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("link", { name: "销售单" }).click();
  await expect(page).toHaveURL(/\/sales-orders$/);
});

test("审计筛选拒绝无效日历日期和反向日期范围", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);

  await page.goto("/audit?from=2026-02-31");
  await expect(
    page.getByText("请输入真实有效的日期。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("每页条数")).toContainText("20 条");

  await page.goto("/audit?from=2026-08-14&to=2026-08-13");
  await expect(
    page.getByText("开始日期不能晚于结束日期。", { exact: true }),
  ).toBeVisible();
});

test("创建账号 Server Action 在提交时重新校验当前会话", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/settings/accounts/new");
  await page.getByLabel("姓名").fill("越权测试账号");
  await page.getByLabel("邮箱").fill(`unauthorized-${randomUUID()}@example.local`);
  await page.getByLabel("初始密码").fill(password);
  const salesRole = page.getByRole("checkbox", { name: "销售" });
  await salesRole.click();
  await expect(salesRole).toHaveAttribute("aria-checked", "true");

  await switchSession(page, "sales@example.local");
  await page.getByRole("button", { name: "创建账号" }).click();

  await expect(page.getByText("没有访问权限。", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/accounts\/new$/);
});

test("调整角色 Server Action 在提交时重新校验当前会话", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/settings/accounts");
  await page.goto(await multiAccountEditHref(page));
  const warehouseRole = page.getByRole("checkbox", { name: "仓库" });
  await expect(warehouseRole).toHaveAttribute("aria-checked", "true");
  await warehouseRole.click();
  await expect(warehouseRole).toHaveAttribute("aria-checked", "false");

  await switchSession(page, "sales@example.local");
  await page.getByRole("button", { name: "保存角色" }).click();

  await expect(page.getByText("没有访问权限。", { exact: true })).toBeVisible();
});

test("停用账号 Server Action 在提交时重新校验当前会话", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/settings/accounts");
  const row = page
    .getByRole("row")
    .filter({ hasText: "multi@example.local" });
  await row.getByRole("button", { name: "停用" }).click();
  const confirmation = page.getByRole("checkbox", {
    name: "我确认停用此账号并撤销已有会话。",
  });
  await confirmation.click();
  await expect(confirmation).toHaveAttribute("aria-checked", "true");

  await switchSession(page, "sales@example.local");
  await page.getByRole("button", { name: "确认停用" }).click();

  await expect(page.getByText("没有访问权限。", { exact: true })).toBeVisible();
});
