import { describe, expect, it } from "vitest";

import {
  authorizeCapability,
  getActorHomePath,
  getActorNavigation,
  type Capability,
} from "./access-policy";
import type { Actor, Role } from "./resolve-actor";

const roles: Role[] = ["OWNER", "SALES", "WAREHOUSE", "FINANCE"];

const capabilitiesByRole: Record<Role, Capability[]> = {
  OWNER: [
    "OVERVIEW_VIEW",
    "SALES_ORDERS_VIEW",
    "OUTBOUND_VIEW",
    "RECEIVABLES_VIEW",
    "ACCOUNTS_MANAGE",
    "AUDIT_VIEW",
  ],
  SALES: ["SALES_ORDERS_VIEW"],
  WAREHOUSE: ["OUTBOUND_VIEW"],
  FINANCE: ["RECEIVABLES_VIEW"],
};

function actorWith(...actorRoles: Role[]): Actor {
  return {
    id: `actor-${actorRoles.join("-").toLowerCase()}`,
    name: "测试账号",
    email: "actor@example.local",
    roles: actorRoles,
  };
}

describe("角色权限", () => {
  for (const role of roles) {
    it(`${role} 只允许职责内的工作区能力`, () => {
      const actor = actorWith(role);

      for (const capability of Object.values(capabilitiesByRole).flat()) {
        const result = authorizeCapability(actor, capability);

        expect(result.kind).toBe(
          capabilitiesByRole[role].includes(capability)
            ? "authorized"
            : "forbidden",
        );
      }
    });
  }

  it("多角色账号使用权限并集并展示合并导航", () => {
    const actor = actorWith("SALES", "WAREHOUSE");

    expect(authorizeCapability(actor, "SALES_ORDERS_VIEW").kind).toBe(
      "authorized",
    );
    expect(authorizeCapability(actor, "OUTBOUND_VIEW").kind).toBe(
      "authorized",
    );
    expect(authorizeCapability(actor, "RECEIVABLES_VIEW").kind).toBe(
      "forbidden",
    );
    expect(getActorNavigation(actor).map(({ href }) => href)).toEqual([
      "/sales-orders",
      "/warehouse/outbound",
    ]);
  });
});

describe("角色首页", () => {
  it.each([
    ["OWNER", "/overview"],
    ["SALES", "/sales-orders"],
    ["WAREHOUSE", "/warehouse/outbound"],
    ["FINANCE", "/receivables"],
  ] as const)("%s 进入对应职责首页", (role, path) => {
    expect(getActorHomePath(actorWith(role))).toBe(path);
  });

  it("多角色账号按合并导航中的第一个工作区进入", () => {
    expect(getActorHomePath(actorWith("WAREHOUSE", "SALES"))).toBe(
      "/sales-orders",
    );
  });
});
