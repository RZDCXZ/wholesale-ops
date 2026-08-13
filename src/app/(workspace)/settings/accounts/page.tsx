import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listAccountsPage } from "@/application/accounts/account-service";
import type { Role } from "@/application/auth/resolve-actor";
import { AccountsManager } from "@/components/accounts-manager";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "账号与角色" };

const validRoles = new Set<Role>(["OWNER", "SALES", "WAREHOUSE", "FINANCE"]);

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function accountsHref({
  query,
  role,
  status,
  page,
  pageSize,
}: {
  query: string;
  role: string;
  status: string;
  page: number;
  pageSize: number;
}): string {
  const parameters = new URLSearchParams();
  if (query) parameters.set("q", query);
  if (role) parameters.set("role", role);
  if (status) parameters.set("status", status);
  if (page > 1) parameters.set("page", String(page));
  if (pageSize !== 20) parameters.set("size", String(pageSize));
  const queryString = parameters.toString();
  return queryString ? `/settings/accounts?${queryString}` : "/settings/accounts";
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("ACCOUNTS_MANAGE");
  const parameters = await searchParams;
  const query = first(parameters.q).trim();
  const roleValue = first(parameters.role);
  const statusValue = first(parameters.status);
  const status = ["enabled", "disabled"].includes(statusValue)
    ? statusValue
    : "";
  const page = positiveInteger(first(parameters.page));
  const requestedPageSize = positiveInteger(first(parameters.size));
  const pageSize = [20, 50, 100].includes(requestedPageSize)
    ? requestedPageSize
    : 20;
  const role = validRoles.has(roleValue as Role)
    ? (roleValue as Role)
    : undefined;
  const enabled =
    status === "enabled" ? true : status === "disabled" ? false : undefined;
  const accountPage = await listAccountsPage(
    prisma,
    actor,
    { query, role, enabled },
    { page, pageSize },
  );

  if (page > accountPage.totalPages) {
    redirect(
      accountsHref({
        query,
        role: role ?? "",
        status,
        page: accountPage.totalPages,
        pageSize,
      }),
    );
  }

  const hrefForPage = (targetPage: number) =>
    accountsHref({
      query,
      role: role ?? "",
      status,
      page: targetPage,
      pageSize,
    });

  return (
    <AccountsManager
      accounts={accountPage.items.map((account) => ({
        id: account.id,
        name: account.name,
        email: account.email,
        enabled: account.enabled,
        roles: account.roles,
        lastSessionAt: formatDate(account.lastSessionAt),
      }))}
      filters={{
        query,
        role: role ?? "",
        status,
        pageSize,
        active: Boolean(query || role || status),
      }}
      pagination={{
        page: accountPage.page,
        total: accountPage.total,
        totalPages: accountPage.totalPages,
        previousHref: page > 1 ? hrefForPage(page - 1) : undefined,
        nextHref:
          page < accountPage.totalPages ? hrefForPage(page + 1) : undefined,
      }}
    />
  );
}
