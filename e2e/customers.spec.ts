import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { selectFormOption } from "./support/form-controls";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for customer E2E tests.");

async function signIn(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function switchSession(page: Page, email: string) {
  const status = await page.evaluate(async ({ nextEmail, nextPassword }) => {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const response = await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: nextEmail, password: nextPassword }) });
    return response.status;
  }, { nextEmail: email, nextPassword: password });
  expect(status).toBe(200);
}

test("老板维护并转交客户后，销售数据范围立即切换", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const customerCode = `E2E-CUSTOMER-${suffix}`;
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  try {
    await signIn(page, "owner@example.local", /\/overview$/);
    await page.goto("/customers/new");
    await page.getByLabel("客户编码").fill(customerCode);
    await page.getByLabel("客户名称").fill("浏览器测试客户");
    await page.getByLabel("联系人").fill("测试联系人");
    await page.getByLabel("电话").fill("138 0000 0011");
    await selectFormOption(page, page.getByLabel("客户负责人"), "陈敏");
    await page.getByLabel("地址").fill("广东省深圳市测试路 11 号");
    await page.getByRole("button", { name: "创建客户" }).click();

    await expect(page).toHaveURL(/\/customers\/[^/?]+\?notice=created$/);
    const customerPath = new URL(page.url()).pathname;
    await expect(page.getByText("客户已创建，资料和业务审计已同时写入。", { exact: true })).toBeVisible();
    await expect(page.getByText("现结（交付当天到期）", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "编辑资料" }).click();
    await expect(page.getByLabel("客户编码")).toBeDisabled();
    await page.getByLabel("客户名称").fill("浏览器测试客户（已编辑）");
    await page.getByRole("button", { name: "保存资料" }).click();
    await expect(page.getByText("客户资料已更新，客户编码与负责人保持不变。", { exact: true })).toBeVisible();

    const reassignButton = page.getByRole("button", { name: "调整负责人" });
    await reassignButton.click();
    await expect(page.getByRole("dialog", { name: "调整客户负责人" })).toBeVisible();
    await page.getByRole("button", { name: "关闭" }).click();
    await expect(reassignButton).toBeFocused();
    await reassignButton.click();
    await selectFormOption(page, page.getByLabel("新的客户负责人"), "赵磊");
    await page.getByRole("button", { name: "确认转交" }).click();
    await expect(page.getByText("客户负责人已调整，服务端数据范围立即生效。", { exact: true })).toBeVisible();

    await switchSession(page, "sales@example.local");
    await page.goto(customerPath);
    await expect(page.getByRole("heading", { name: "客户不存在或不可访问" })).toBeVisible();

    await switchSession(page, "multi@example.local");
    await page.goto(customerPath);
    await expect(page.getByText("浏览器测试客户（已编辑）", { exact: true }).first()).toBeVisible();
  } finally {
    await prisma.customer.deleteMany({ where: { customerCode } });
    await prisma.$disconnect();
  }
});

test("财务只读客户、仓库无客户目录权限", async ({ page }) => {
  await signIn(page, "finance@example.local", /\/receivables$/);
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "客户", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "新建客户" })).toHaveCount(0);
  await page.getByRole("row").filter({ hasText: "KH-0003" }).click();
  await expect(page).toHaveURL(/\/customers\/demo-customer-kh-0003$/);
  await expect(page.getByText("广顺五金商行", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "编辑资料" })).toHaveCount(0);
  await page.goto("/customers/new");
  await expect(page).toHaveURL(/\/forbidden$/);

  await switchSession(page, "warehouse@example.local");
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/forbidden$/);
});

test("客户 Server Action 在提交时重新校验当前会话", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/customers/new");
  await page.getByLabel("客户编码").fill(`E2E-CUSTOMER-AUTH-${Date.now().toString(36)}`);
  await page.getByLabel("客户名称").fill("越权测试客户");
  await page.getByLabel("联系人").fill("测试联系人");
  await page.getByLabel("电话").fill("138 0000 0012");
  await selectFormOption(page, page.getByLabel("客户负责人"), "陈敏");
  await page.getByLabel("地址").fill("广东省深圳市越权测试路 12 号");

  await switchSession(page, "finance@example.local");
  await page.getByRole("button", { name: "创建客户" }).click();
  await expect(page.getByText("没有访问权限。", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/customers\/new$/);
});
