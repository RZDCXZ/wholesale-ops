import { describe, expect, it } from "vitest";

import {
  calculateReceivableDueDate,
  calculateSettlement,
  snapshotPaymentTermDays,
} from "./receivable-policy";

describe("应收领域策略", () => {
  it("按中国自然日快照账期并计算到期日", () => {
    const customer = { paymentTermDays: 30 };
    const paymentTermDaysSnapshot = snapshotPaymentTermDays(
      customer.paymentTermDays,
    );
    customer.paymentTermDays = 45;

    expect(paymentTermDaysSnapshot).toBe(30);
    expect(
      calculateReceivableDueDate(
        new Date("2026-08-13T16:30:00.000Z"),
        paymentTermDaysSnapshot,
      ),
    ).toEqual(new Date("2026-09-13T00:00:00.000Z"));
    expect(
      calculateReceivableDueDate(new Date("2026-08-13T15:30:00.000Z"), 0),
    ).toEqual(new Date("2026-08-13T00:00:00.000Z"));
  });

  it("从原始金额和已收金额推导待收、部分收款与已结清", () => {
    expect(calculateSettlement(0, 0)).toEqual({
      receivedAmountFen: 0,
      remainingAmountFen: 0,
      status: "SETTLED",
    });
    expect(calculateSettlement(108_400, 0)).toEqual({
      receivedAmountFen: 0,
      remainingAmountFen: 108_400,
      status: "PENDING",
    });
    expect(calculateSettlement(108_400, 20_000)).toEqual({
      receivedAmountFen: 20_000,
      remainingAmountFen: 88_400,
      status: "PARTIAL",
    });
    expect(calculateSettlement(108_400, 108_400)).toEqual({
      receivedAmountFen: 108_400,
      remainingAmountFen: 0,
      status: "SETTLED",
    });
    expect(() => calculateSettlement(108_400, 108_401)).toThrow("已收金额");
  });
});
