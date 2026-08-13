import { expect, test } from "@playwright/test";

const ownerCredentials = {
  email: "owner@example.local",
  password: "demo123456",
};

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(ownerCredentials.email);
  await page.getByLabel("密码").fill(ownerCredentials.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("未登录访问老板工作区会转到登录页", async ({ page }) => {
  await page.goto("/overview");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "登录工作区" }),
  ).toBeVisible();
});

test("错误凭据只显示通用登录失败信息", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(ownerCredentials.email);
  await page.getByLabel("密码").fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await expect(
    page.getByText("邮箱或密码不正确，请检查后重试。", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("公开注册 API 被关闭", async ({ request }) => {
  const response = await request.post("/api/auth/sign-up/email", {
    data: {
      name: "未授权用户",
      email: "not-allowed@example.local",
      password: "not-allowed-password",
    },
  });

  expect(response.ok()).toBe(false);
});

test("预置老板账号登录后进入老板工作区", async ({ page }) => {
  await signInAsOwner(page);

  await expect(page.getByRole("heading", { name: "经营总览" })).toBeVisible();
  await expect(page.getByText("张伟", { exact: true })).toBeVisible();
  await expect(page.getByText("老板", { exact: true })).toBeVisible();
});

test("退出后原会话不能继续访问老板工作区", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: /张伟/ }).click();
  await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login$/);
});
