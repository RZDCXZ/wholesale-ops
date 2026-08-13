import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sales order E2E tests.");

async function signIn(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function switchSession(page: Page, email: string) {
  const status = await page.evaluate(async ({ nextEmail, nextPassword }) => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: nextEmail, password: nextPassword }),
    });
    return response.status;
  }, { nextEmail: email, nextPassword: password });
  expect(status).toBe(200);
}

test("销售创建、校验、编辑并删除库存不足的多 SKU 草稿", async ({ page }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  let salesOrderId: string | undefined;
  try {
    await signIn(page, "sales@example.local", /\/sales-orders$/);
    await page.getByRole("link", { name: "新建销售单" }).first().click();
    await expect(page).toHaveURL(/\/sales-orders\/new$/);
    await page.getByLabel("客户").selectOption("demo-customer-kh-0003");
    await expect(page.getByText("李海峰 · 138 0000 0000", { exact: true })).toBeVisible();
    await expect(page.getByText("30 天", { exact: true })).toBeVisible();

    const firstItem = page.getByTestId("sales-order-item").nth(0);
    await firstItem.getByLabel("SKU", { exact: true }).selectOption("demo-sku-wj-ls-001");
    await firstItem.getByLabel("数量").fill("20");
    await expect(firstItem.getByLabel("成交价")).toHaveValue("48.50");
    await page.getByRole("button", { name: "添加明细" }).click();
    const secondItem = page.getByTestId("sales-order-item").nth(1);
    await secondItem.getByLabel("搜索 SKU").fill("切割片");
    await expect(secondItem.getByLabel("SKU", { exact: true }).locator("option")).toHaveCount(2);
    await secondItem.getByLabel("SKU", { exact: true }).selectOption("demo-sku-wj-qp-004");
    await secondItem.getByLabel("数量").fill("70");
    await expect(secondItem.getByLabel("成交价")).toHaveValue("3.80");
    await expect(secondItem.getByText(/当前可用量 50 片/)).toBeVisible();
    await expect(secondItem.getByText(/缺少 20 片/)).toBeVisible();
    await expect(page.getByText("¥1,236.00", { exact: true })).toBeVisible();

    await secondItem.getByLabel("成交价").fill("1.234");
    await page.getByRole("button", { name: "保存草稿" }).click();
    const priceError = page.getByText("成交价必须是最多两位小数的非负人民币金额。", { exact: true });
    await expect(priceError).toBeVisible();
    const priceErrorId = await priceError.getAttribute("id");
    expect(priceErrorId).not.toBeNull();
    await expect(secondItem.getByLabel("成交价")).toHaveAttribute("aria-describedby", priceErrorId!);
    await expect(secondItem.getByLabel("数量")).toHaveValue("70");
    await expect(secondItem.getByLabel("成交价")).toHaveValue("1.234");

    await secondItem.getByLabel("成交价").fill("3.80");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page).toHaveURL(/\/sales-orders\/[^/?]+\/edit\?notice=created$/);
    salesOrderId = new URL(page.url()).pathname.split("/")[2];
    await expect(page.getByRole("status")).toContainText("销售单草稿已保存");
    await expect(page.getByText("¥1,236.00", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText("缺少 20 片", { exact: true })).toBeVisible();
    await secondItem.getByLabel("数量").fill("30");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page).toHaveURL(/notice=updated$/);
    await expect(page.getByText("¥1,084.00", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "返回销售单列表" }).first().click();
    const row = page.getByRole("row").filter({ hasText: "广顺五金商行" }).first();
    await expect(row).toContainText("¥1,084.00");
    const deleteButton = row.getByRole("button", { name: "删除" });
    await deleteButton.click();
    await expect(page.getByRole("dialog", { name: "删除销售单草稿" })).toBeVisible();
    await page.getByRole("button", { name: "返回" }).click();
    await expect(deleteButton).toBeFocused();
    await deleteButton.click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByRole("status")).toContainText("销售单草稿已删除");
    await expect(prisma.salesOrder.count({ where: { id: salesOrderId } })).resolves.toBe(0);
    await expect(
      prisma.businessAudit.count({
        where: { objectId: salesOrderId, action: { startsWith: "SALES_ORDER_DRAFT_" } },
      }),
    ).resolves.toBe(3);
  } finally {
    if (salesOrderId) {
      await prisma.salesOrder.deleteMany({ where: { id: salesOrderId } });
    }
    await prisma.$disconnect();
  }
});

test("移动端通过全屏筛选抽屉筛选销售单并看到已启用条件", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "sales@example.local", /\/sales-orders$/);

  await page.getByRole("button", { name: "打开销售单筛选" }).click();
  const filters = page.getByRole("dialog", { name: "筛选销售单" });
  await expect(filters).toBeVisible();
  await filters.getByLabel("履约状态").selectOption("DRAFT");
  await filters.getByRole("button", { name: "应用筛选" }).click();

  await expect(page).toHaveURL(/status=DRAFT/);
  await expect(page.getByText("履约状态：草稿", { exact: true })).toBeVisible();
});

test("销售单草稿表单提示未保存离开并在提交时重新校验会话", async ({ page }) => {
  await signIn(page, "sales@example.local", /\/sales-orders$/);
  await page.goto("/sales-orders/new");
  await page.getByLabel("客户").selectOption("demo-customer-kh-0003");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "客户", exact: true }).click();
  await expect(page).toHaveURL(/\/sales-orders\/new$/);

  const item = page.getByTestId("sales-order-item").first();
  await item.getByLabel("SKU", { exact: true }).selectOption("demo-sku-wj-ls-001");
  await item.getByLabel("数量").fill("7");
  await switchSession(page, "finance@example.local");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("没有访问销售单的权限。", { exact: true })).toBeVisible();
  await expect(item.getByLabel("数量")).toHaveValue("7");
  await expect(page).toHaveURL(/\/sales-orders\/new$/);
});
