import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for SKU E2E tests.");

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
    },
    { nextEmail: email, nextPassword: password },
  );
  expect(result).toBe(200);
}

test("老板可以创建、编辑和停用 SKU，销售只看到启用目录", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const skuCode = `E2E-${suffix}`;
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

  try {
    await signIn(page, "owner@example.local", /\/overview$/);
    await page.goto("/skus/new");
    await page.getByLabel("SKU 编码").fill(skuCode);
    await page.getByLabel("名称").fill("浏览器测试六角螺栓");
    await page.getByLabel("分类").fill("紧固件");
    await page.getByLabel("库存单位").fill("盒");
    await page.getByLabel("参考售价（元）").fill("48.50");
    await page.getByLabel("预警值").fill("20");
    await page.getByRole("button", { name: "创建 SKU" }).click();

    await expect(page).toHaveURL(/\/skus\/[^/?]+\?notice=created$/);
    await expect(page.getByText("SKU 已创建，资料和业务审计已同时写入。", { exact: true })).toBeVisible();
    await expect(page.getByText("现存量", { exact: true })).toBeVisible();
    await expect(page.getByText("预占量", { exact: true })).toBeVisible();
    await expect(page.getByText("可用量", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "编辑资料" })).toBeVisible();
    await expect(page.getByLabel("SKU 编码")).toHaveCount(0);

    await page.getByRole("link", { name: "编辑资料" }).click();
    await expect(page).toHaveURL(/\/skus\/[^/?]+\/edit$/);
    await expect(page.getByLabel("SKU 编码")).toBeDisabled();
    await expect(page.getByLabel("库存单位")).toBeDisabled();

    await page.getByLabel("名称").fill("尚未保存的名称");
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("表单尚未保存，确认离开吗？");
      await dialog.accept();
    });
    await page.getByRole("link", { name: "取消编辑" }).first().click();
    await expect(page).toHaveURL(/\/skus\/[^/?]+$/);

    await page.getByRole("link", { name: "编辑资料" }).click();
    await page.getByLabel("名称").fill("304 不锈钢六角螺栓 E2E");
    await page.getByRole("button", { name: "保存资料" }).click();
    await expect(page.getByText("SKU 资料已更新，SKU 编码和库存单位保持不变。", { exact: true })).toBeVisible();

    await page.goto(`/skus?q=${skuCode}`);
    await expect(page.getByText("搜索", { exact: true })).toBeVisible();
    await expect(page.getByText("分类", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("仅看库存预警")).toBeVisible();
    await page.getByText("304 不锈钢六角螺栓 E2E", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/skus\/[^/?]+$/);

    await page.getByRole("link", { name: "查看完整流水" }).click();
    await expect(page).toHaveURL(/\/inventory\/ledger\?skuId=/);
    await expect(page.getByRole("heading", { name: "该 SKU 暂无库存流水" })).toBeVisible();
    await page.getByRole("link", { name: "返回 SKU 详情" }).click();

    await page.getByRole("button", { name: "停用 SKU" }).click();
    await expect(page.getByRole("dialog", { name: "停用 SKU" })).toBeVisible();
    await page.getByRole("button", { name: "确认停用" }).click();
    await expect(page.getByText("SKU 已停用，不再提供给销售选择。", { exact: true })).toBeVisible();

    await switchSession(page, "sales@example.local");
    await page.goto(`/skus?q=${skuCode}`);
    await expect(page.getByText("当前筛选无结果", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "新建 SKU" })).toHaveCount(0);
  } finally {
    await prisma.sku.deleteMany({ where: { skuCode } });
    await prisma.$disconnect();
  }
});

test("SKU Server Action 在提交时重新校验当前会话", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/skus/new");
  await page.getByLabel("SKU 编码").fill(`E2E-AUTH-${Date.now().toString(36)}`);
  await page.getByLabel("名称").fill("越权测试 SKU");
  await page.getByLabel("分类").fill("测试");
  await page.getByLabel("库存单位").fill("个");
  await page.getByLabel("参考售价（元）").fill("1.00");
  await page.getByLabel("预警值").fill("0");

  await switchSession(page, "sales@example.local");
  await page.getByRole("button", { name: "创建 SKU" }).click();
  await expect(page.getByText("没有访问权限。", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/skus\/new$/);
});

test("销售可以查看启用 SKU 详情但不能进入编辑页", async ({ page }) => {
  await signIn(page, "sales@example.local", /\/sales-orders$/);
  await page.goto("/skus");
  await expect(page.getByRole("columnheader", { name: "可用量" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "现存量" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "预占量" })).toHaveCount(0);
  await expect(page.getByLabel("仅看库存预警")).toHaveCount(0);

  await page.goto("/skus/demo-sku-wj-qp-004");
  await expect(page.getByRole("heading", { name: "基本资料" })).toBeVisible();
  await expect(page.getByText("可用量", { exact: true })).toBeVisible();
  await expect(page.getByText("现存量", { exact: true })).toHaveCount(0);
  await expect(page.getByText("预占量", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "编辑资料" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "查看完整流水" })).toHaveCount(0);

  await page.goto("/skus/demo-sku-wj-qp-004/edit");
  await expect(page).toHaveURL(/\/forbidden$/);
});

for (const role of ["warehouse", "finance"] as const) {
  test(`${role} 不能直接访问 SKU 目录和维护页`, async ({ page }) => {
    await signIn(
      page,
      `${role}@example.local`,
      role === "warehouse" ? /\/warehouse\/outbound$/ : /\/receivables$/,
    );
    for (const path of ["/skus", "/skus/new"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/forbidden$/);
    }

    await page.goto("/inventory/ledger?skuId=demo-sku-wj-qp-004");
    if (role === "warehouse") {
      await expect(page.getByRole("heading", { name: "库存流水", exact: true })).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/forbidden$/);
    }
  });
}
