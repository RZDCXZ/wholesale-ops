export type SalesOrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "OUTBOUND"
  | "CANCELLED";

export type SalesOrderActor = {
  id: string;
  roles: readonly Role[];
};

export type SalesOrderDataScope = "ALL" | "RESPONSIBLE_CUSTOMERS" | "NONE";

const allowedTransitions: Readonly<
  Record<SalesOrderStatus, readonly SalesOrderStatus[]>
> = {
  DRAFT: ["CONFIRMED"],
  CONFIRMED: ["OUTBOUND", "CANCELLED"],
  OUTBOUND: [],
  CANCELLED: [],
};

export function canTransitionSalesOrder(
  from: SalesOrderStatus,
  to: SalesOrderStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function salesOrderDataScope(
  actor: SalesOrderActor,
): SalesOrderDataScope {
  if (actor.roles.includes("OWNER")) return "ALL";
  if (actor.roles.includes("SALES")) return "RESPONSIBLE_CUSTOMERS";
  return "NONE";
}

export function canManageCustomerSalesOrder(
  actor: SalesOrderActor,
  responsibleSalesId: string,
): boolean {
  const scope = salesOrderDataScope(actor);
  return (
    scope === "ALL" ||
    (scope === "RESPONSIBLE_CUSTOMERS" && responsibleSalesId === actor.id)
  );
}

export function calculateSalesOrderAmounts(
  items: readonly { quantity: number; transactionPriceFen: number }[],
  maximumAmountFen = 2_147_483_647,
): { subtotalsFen: number[]; totalAmountFen: number } {
  const subtotalsFen = items.map(({ quantity, transactionPriceFen }) => {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new RangeError("销售明细数量必须是正整数。");
    }
    if (
      !Number.isSafeInteger(transactionPriceFen) ||
      transactionPriceFen < 0
    ) {
      throw new RangeError("销售明细成交金额必须是非负整数分。");
    }

    const subtotalFen = quantity * transactionPriceFen;
    if (!Number.isSafeInteger(subtotalFen) || subtotalFen > maximumAmountFen) {
      throw new RangeError("销售明细成交金额超出允许范围。");
    }
    return subtotalFen;
  });

  const totalAmountFen = subtotalsFen.reduce(
    (total, subtotalFen) => total + subtotalFen,
    0,
  );
  if (!Number.isSafeInteger(totalAmountFen) || totalAmountFen > maximumAmountFen) {
    throw new RangeError("销售单成交金额超出允许范围。");
  }

  return { subtotalsFen, totalAmountFen };
}
import type { Role } from "./role";
