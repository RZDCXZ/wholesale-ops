import type { Actor, Role } from "./resolve-actor";

export type Capability =
  | "OVERVIEW_VIEW"
  | "SALES_ORDERS_VIEW"
  | "OUTBOUND_VIEW"
  | "RECEIVABLES_VIEW"
  | "AUDIT_VIEW"
  | "ACCOUNTS_MANAGE";

export type NavigationItem = {
  capability: Capability;
  group: "经营" | "销售" | "仓库" | "财务" | "数据" | "设置";
  label: string;
  href: string;
};

const navigation: NavigationItem[] = [
  {
    capability: "OVERVIEW_VIEW",
    group: "经营",
    label: "经营总览",
    href: "/overview",
  },
  {
    capability: "SALES_ORDERS_VIEW",
    group: "销售",
    label: "销售单",
    href: "/sales-orders",
  },
  {
    capability: "OUTBOUND_VIEW",
    group: "仓库",
    label: "待出库",
    href: "/warehouse/outbound",
  },
  {
    capability: "RECEIVABLES_VIEW",
    group: "财务",
    label: "应收",
    href: "/receivables",
  },
  {
    capability: "AUDIT_VIEW",
    group: "数据",
    label: "业务审计",
    href: "/audit",
  },
  {
    capability: "ACCOUNTS_MANAGE",
    group: "设置",
    label: "账号与角色",
    href: "/settings/accounts",
  },
];

const capabilitiesByRole: Record<Role, ReadonlySet<Capability>> = {
  OWNER: new Set(navigation.map(({ capability }) => capability)),
  SALES: new Set(["SALES_ORDERS_VIEW"]),
  WAREHOUSE: new Set(["OUTBOUND_VIEW"]),
  FINANCE: new Set(["RECEIVABLES_VIEW"]),
};

export type CapabilityAuthorizationResult =
  | { kind: "authorized"; actor: Actor }
  | { kind: "forbidden" };

export function authorizeCapability(
  actor: Actor,
  capability: Capability,
): CapabilityAuthorizationResult {
  const allowed = actor.roles.some((role) =>
    capabilitiesByRole[role].has(capability),
  );

  return allowed ? { kind: "authorized", actor } : { kind: "forbidden" };
}

export function getActorNavigation(actor: Actor): NavigationItem[] {
  return navigation.filter(
    ({ capability }) => authorizeCapability(actor, capability).kind === "authorized",
  );
}

export function getActorHomePath(actor: Actor): string {
  return getActorNavigation(actor)[0]?.href ?? "/forbidden";
}
