import { expect, test } from "@playwright/test";

const password = "demo123456";

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  expectedPath: RegExp,
) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

for (const [email, path, heading] of [
  ["owner@example.local", /\/overview$/, "经营总览"],
  ["sales@example.local", /\/sales-orders$/, "销售单"],
  ["warehouse@example.local", /\/warehouse\/outbound$/, "待出库工作台"],
  ["finance@example.local", /\/receivables$/, "应收"],
] as const) {
  test(`${email} 登录后进入职责首页`, async ({ page }) => {
    await signIn(page, email, path);

    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  });
}

test("多角色账号使用销售与仓库权限并集且没有角色切换器", async ({ page }) => {
  await signIn(page, "multi@example.local", /\/sales-orders$/);

  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation.getByRole("link", { name: "销售单" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "SKU" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "待出库" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "库存" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "应收" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /赵磊/ })).toContainText("销售");
  await expect(page.getByRole("button", { name: /赵磊/ })).toContainText("仓库");
  await expect(page.getByText("切换角色")).toHaveCount(0);

  await page.goto("/warehouse/outbound");
  await expect(
    page.getByRole("heading", { name: "待出库工作台", exact: true }),
  ).toBeVisible();

  await page.goto("/receivables");
  await expect(page).toHaveURL(/\/forbidden$/);
});

for (const role of ["sales", "warehouse", "finance"] as const) {
  test(`${role} 直接访问老板能力时得到通用权限错误`, async ({ page }) => {
    await signIn(
      page,
      `${role}@example.local`,
      role === "sales"
        ? /\/sales-orders$/
        : role === "warehouse"
          ? /\/warehouse\/outbound$/
          : /\/receivables$/,
    );

    for (const path of ["/settings/accounts", "/audit"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/forbidden$/);
      await expect(
        page.getByRole("heading", { name: "没有访问权限" }),
      ).toBeVisible();
      await expect(page.getByText("当前账号没有进入此工作区所需的权限。", { exact: true })).toBeVisible();
    }
  });
}

test("老板和仓库可查看库存，销售与财务不能访问库存页", async ({ page }) => {
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "库存", exact: true })).toBeVisible();
  await expect(page.getByText("可用量 = 现存量 - 预占量", { exact: false })).toBeVisible();

  for (const role of ["sales", "finance"] as const) {
    await page.getByRole("button", { name: /张伟|陈敏|刘芳/ }).click();
    await page.getByRole("menuitem", { name: "退出登录" }).click();
    await signIn(
      page,
      `${role}@example.local`,
      role === "sales" ? /\/sales-orders$/ : /\/receivables$/,
    );
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/forbidden$/);
    await page.goto(role === "sales" ? "/sales-orders" : "/receivables");
  }

  await page.getByRole("button", { name: /刘芳/ }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await signIn(page, "warehouse@example.local", /\/warehouse\/outbound$/);
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "库存", exact: true })).toBeVisible();
});
