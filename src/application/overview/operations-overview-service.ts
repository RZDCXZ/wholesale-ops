import type { PrismaClient } from "../../generated/prisma/client";
import {
  addUtcCalendarDays,
  chinaCalendarDayRange,
  formatChinaCalendarDate,
  parseCalendarDate,
  utcCalendarDateString,
} from "../../lib/china-calendar";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";
import { listInventory } from "../inventory/inventory-service";

export type OperationsOverview = {
  asOfDate: string;
  todaySales: { amountFen: number; count: number };
  todayPayments: { amountFen: number; count: number };
  receivables: {
    remainingAmountFen: number;
    unsettledCount: number;
    overdueAmountFen: number;
    overdueCount: number;
  };
  inventoryWarnings: {
    count: number;
    items: Array<{
      skuId: string;
      skuCode: string;
      name: string;
      inventoryUnit: string;
      availableQuantity: number;
      warningThreshold: number;
    }>;
  };
  paymentTrend: Array<{ date: string; amountFen: number }>;
};

export class OperationsOverviewServiceError extends Error {
  constructor(
    readonly code: "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "OperationsOverviewServiceError";
  }
}

function assertOverviewAccess(actor: Actor): void {
  if (authorizeCapability(actor, "OVERVIEW_VIEW").kind !== "authorized") {
    throw new OperationsOverviewServiceError(
      "FORBIDDEN",
      "没有访问经营总览的权限。",
    );
  }
}

function sumAmounts(items: Array<{ amountFen: number }>): number {
  return items.reduce((sum, item) => sum + item.amountFen, 0);
}

export async function getOperationsOverview(
  database: PrismaClient,
  actor: Actor,
  now = new Date(),
): Promise<OperationsOverview> {
  assertOverviewAccess(actor);

  const asOfDate = formatChinaCalendarDate(now);
  const todayRange = chinaCalendarDayRange(asOfDate)!;
  const todayCalendarDate = parseCalendarDate(asOfDate)!;
  const trendStart = addUtcCalendarDays(todayCalendarDate, -29);

  const [sales, payments, unsettledReceivables, warningInventory, trendPayments] =
    await Promise.all([
      database.receivable.findMany({
        where: {
          outboundAt: { gte: todayRange.start, lt: todayRange.endExclusive },
          salesOrder: { is: { status: "OUTBOUND" } },
        },
        select: { salesOrder: { select: { totalAmountFen: true } } },
      }),
      database.payment.findMany({
        where: {
          recordedAt: { gte: todayRange.start, lt: todayRange.endExclusive },
          reversal: { is: null },
        },
        select: { amountFen: true },
      }),
      database.receivable.findMany({
        where: { remainingAmountFen: { gt: 0 } },
        select: { remainingAmountFen: true, dueDate: true },
      }),
      listInventory(database, actor, {
        enabled: true,
        inventoryWarning: true,
      }),
      database.payment.findMany({
        where: {
          paymentDate: { gte: trendStart, lte: todayCalendarDate },
          reversal: { is: null },
        },
        select: { paymentDate: true, amountFen: true },
      }),
    ]);

  const overdueReceivables = unsettledReceivables.filter(
    ({ dueDate }) => dueDate < todayCalendarDate,
  );
  const trendAmountByDate = new Map<string, number>();
  for (const payment of trendPayments) {
    const date = utcCalendarDateString(payment.paymentDate);
    trendAmountByDate.set(
      date,
      (trendAmountByDate.get(date) ?? 0) + payment.amountFen,
    );
  }

  return {
    asOfDate,
    todaySales: {
      amountFen: sales.reduce(
        (sum, item) => sum + item.salesOrder.totalAmountFen,
        0,
      ),
      count: sales.length,
    },
    todayPayments: {
      amountFen: sumAmounts(payments),
      count: payments.length,
    },
    receivables: {
      remainingAmountFen: unsettledReceivables.reduce(
        (sum, item) => sum + item.remainingAmountFen,
        0,
      ),
      unsettledCount: unsettledReceivables.length,
      overdueAmountFen: overdueReceivables.reduce(
        (sum, item) => sum + item.remainingAmountFen,
        0,
      ),
      overdueCount: overdueReceivables.length,
    },
    inventoryWarnings: {
      count: warningInventory.length,
      items: warningInventory.map((item) => ({
        skuId: item.skuId,
        skuCode: item.skuCode,
        name: item.name,
        inventoryUnit: item.inventoryUnit,
        availableQuantity: item.availableQuantity,
        warningThreshold: item.warningThreshold,
      })),
    },
    paymentTrend: Array.from({ length: 30 }, (_, index) => {
      const date = utcCalendarDateString(addUtcCalendarDays(trendStart, index));
      return { date, amountFen: trendAmountByDate.get(date) ?? 0 };
    }),
  };
}
