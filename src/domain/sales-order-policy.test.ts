import { describe, expect, it } from "vitest";

import {
  calculateSalesOrderAmounts,
  canManageCustomerSalesOrder,
  canTransitionSalesOrder,
  salesOrderDataScope,
  type SalesOrderActor,
} from "./sales-order-policy";

describe("销售单领域策略", () => {
  it("只允许草稿确认、已确认出库或取消，终态不可回退", () => {
    expect(canTransitionSalesOrder("DRAFT", "CONFIRMED")).toBe(true);
    expect(canTransitionSalesOrder("CONFIRMED", "OUTBOUND")).toBe(true);
    expect(canTransitionSalesOrder("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransitionSalesOrder("DRAFT", "OUTBOUND")).toBe(false);
    expect(canTransitionSalesOrder("OUTBOUND", "CONFIRMED")).toBe(false);
    expect(canTransitionSalesOrder("CANCELLED", "DRAFT")).toBe(false);
  });

  it("以分为单位计算明细小计和整单成交金额", () => {
    expect(
      calculateSalesOrderAmounts([
        { quantity: 20, transactionPriceFen: 4_850 },
        { quantity: 30, transactionPriceFen: 380 },
      ]),
    ).toEqual({ subtotalsFen: [97_000, 11_400], totalAmountFen: 108_400 });
  });

  it("拒绝非法数量与超出数据库整数范围的金额", () => {
    expect(() =>
      calculateSalesOrderAmounts([
        { quantity: 0, transactionPriceFen: 100 },
      ]),
    ).toThrow("数量");
    expect(() =>
      calculateSalesOrderAmounts(
        [{ quantity: 2, transactionPriceFen: 2_147_483_647 }],
        2_147_483_647,
      ),
    ).toThrow("金额");
  });

  it("老板可看全部，销售只能管理自己负责客户，其他角色无销售数据范围", () => {
    const owner = {
      id: "owner-1",
      roles: ["OWNER"],
    } satisfies SalesOrderActor;
    const sales = {
      id: "sales-1",
      roles: ["SALES"],
    } satisfies SalesOrderActor;
    const warehouse = {
      id: "warehouse-1",
      roles: ["WAREHOUSE"],
    } satisfies SalesOrderActor;

    expect(salesOrderDataScope(owner)).toBe("ALL");
    expect(salesOrderDataScope(sales)).toBe("RESPONSIBLE_CUSTOMERS");
    expect(salesOrderDataScope(warehouse)).toBe("NONE");
    expect(canManageCustomerSalesOrder(owner, "sales-2")).toBe(true);
    expect(canManageCustomerSalesOrder(sales, "sales-1")).toBe(true);
    expect(canManageCustomerSalesOrder(sales, "sales-2")).toBe(false);
    expect(canManageCustomerSalesOrder(warehouse, "warehouse-1")).toBe(false);
  });
});
