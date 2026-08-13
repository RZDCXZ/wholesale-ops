import type { Metadata } from "next";

import { listAccounts } from "@/application/accounts/account-service";
import type { Role } from "@/application/auth/resolve-actor";
import { AccountsManager } from "@/components/accounts-manager";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "账号与角色" };

const validRoles = new Set<Role>(["OWNER", "SALES", "WAREHOUSE", "FINANCE"]);

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;

  return new Intl.DateTimeFormat("zh-CN", {
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
  const status = first(parameters.status);
  const role = validRoles.has(roleValue as Role)
    ? (roleValue as Role)
    : undefined;
  const enabled =
    status === "enabled" ? true : status === "disabled" ? false : undefined;
  const accounts = await listAccounts(prisma, actor, { query, role, enabled });

  return (
    <AccountsManager
      accounts={accounts.map((account) => ({
        id: account.id,
        name: account.name,
        email: account.email,
        enabled: account.enabled,
        roles: account.roles,
        lastSessionAt: formatDate(account.lastSessionAt),
      }))}
      filters={{ query, role: role ?? "", status }}
    />
  );
}
