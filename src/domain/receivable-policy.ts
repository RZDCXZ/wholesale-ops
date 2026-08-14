export type ReceivableStatus = "PENDING" | "PARTIAL" | "SETTLED";

export type ReceivableSettlement = {
  receivedAmountFen: number;
  remainingAmountFen: number;
  status: ReceivableStatus;
};

export function snapshotPaymentTermDays(paymentTermDays: number): number {
  if (!Number.isSafeInteger(paymentTermDays) || paymentTermDays < 0) {
    throw new RangeError("账期必须是非负整数天。");
  }
  return paymentTermDays;
}

function chinaDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function calculateReceivableDueDate(
  outboundAt: Date,
  paymentTermDays: number,
): Date {
  const snapshot = snapshotPaymentTermDays(paymentTermDays);
  const dueDate = new Date(`${chinaDate(outboundAt)}T00:00:00.000Z`);
  dueDate.setUTCDate(dueDate.getUTCDate() + snapshot);
  return dueDate;
}

export function calculateSettlement(
  originalAmountFen: number,
  receivedAmountFen: number,
): ReceivableSettlement {
  if (!Number.isSafeInteger(originalAmountFen) || originalAmountFen < 0) {
    throw new RangeError("应收原始金额必须是非负整数分。");
  }
  if (
    !Number.isSafeInteger(receivedAmountFen) ||
    receivedAmountFen < 0 ||
    receivedAmountFen > originalAmountFen
  ) {
    throw new RangeError("已收金额必须在零与应收原始金额之间。");
  }

  const remainingAmountFen = originalAmountFen - receivedAmountFen;
  const status =
    remainingAmountFen === 0
      ? "SETTLED"
      : receivedAmountFen === 0
        ? "PENDING"
        : "PARTIAL";

  return { receivedAmountFen, remainingAmountFen, status };
}
