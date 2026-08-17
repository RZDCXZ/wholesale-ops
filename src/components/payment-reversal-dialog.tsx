"use client";

import {
  IconAlertCircle,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import {
  reversePaymentAction,
  type PaymentReversalActionState,
} from "@/app/(workspace)/receivables/actions";
import type { PaymentRecord } from "@/application/receivables/receivable-service";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { keepFocusInDialog } from "@/lib/dialog-focus";
import { formatMoney } from "@/lib/format-money";
import { paymentMethodLabels } from "@/lib/receivable-display";

const initialState: PaymentReversalActionState = { status: "idle" };

function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type ReversiblePayment = Pick<
  PaymentRecord,
  "id" | "paymentDate" | "amountFen" | "method" | "referenceNumber"
>;

export type PaymentReversalContext = {
  receivableNumber: string;
  originalAmountFen: number;
  receivedAmountFen: number;
  payment: ReversiblePayment;
};

function PaymentReversalDialog({
  context,
  submissionKey,
  onClose,
}: {
  context: PaymentReversalContext;
  submissionKey: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    reversePaymentAction,
    initialState,
  );
  const [reasonValue, setReasonValue] = useState("");
  const reason = useRef<HTMLTextAreaElement | null>(null);
  const receivedAfter = context.receivedAmountFen - context.payment.amountFen;
  const remainingAfter = context.originalAmountFen - receivedAfter;
  const statusAfter = receivedAfter === 0 ? "待收款" : "部分收款";

  useEffect(() => reason.current?.focus(), []);
  useEffect(() => {
    if (state.fieldErrors?.reason) reason.current?.focus();
  }, [state]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4 max-md:items-end max-md:p-0"
      onMouseDown={(event) =>
        !pending && event.target === event.currentTarget && onClose()
      }
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="撤销这笔收款"
        onKeyDown={(event) => {
          if (!pending) keepFocusInDialog(event, onClose);
        }}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[620px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:max-h-[92dvh] max-md:rounded-t-[14px] max-md:rounded-b-none"
      >
        <header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px] py-3.5">
          <div>
            <h2 className="text-lg font-bold">撤销这笔收款</h2>
            <p className="mt-1 font-mono text-xs text-[#667085]">
              {context.receivableNumber}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            disabled={pending}
            className="grid size-11 place-items-center rounded-lg hover:bg-[#f2f4f7] disabled:opacity-50"
            onClick={onClose}
          >
            <IconX aria-hidden size={20} />
          </button>
        </header>

        <form action={formAction} className="min-h-0 overflow-y-auto">
          <input type="hidden" name="paymentId" value={context.payment.id} />
          <input type="hidden" name="idempotencyKey" value={submissionKey} />
          <div className="grid gap-4 p-5">
            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"
              >
                <IconAlertCircle
                  aria-hidden
                  className="mt-0.5 shrink-0"
                  size={18}
                />
                <span>{state.message}</span>
              </div>
            ) : null}

            <div className="flex items-start gap-3 rounded-lg border border-[#edb1b1] bg-[#fff8f8] p-4 text-[13px] text-[#8a1c1c]">
              <IconRefresh aria-hidden className="mt-0.5 shrink-0" size={19} />
              <div>
                <strong>将创建一条只追加的反向记录</strong>
                <p className="mt-1 leading-5">
                  原收款会永久保留并明确标记为已撤销；本操作不会编辑、删除原收款，也不能再次撤销反向记录。
                </p>
              </div>
            </div>

            <dl className="grid overflow-hidden rounded-lg border border-[#e4e7ec] text-[13px] sm:grid-cols-2">
              <div className="border-b border-[#eef0f3] p-3 sm:border-r">
                <dt className="text-xs text-[#667085]">原收款日期</dt>
                <dd className="mt-1 font-semibold">
                  {formatCalendarDate(context.payment.paymentDate)}
                </dd>
              </div>
              <div className="border-b border-[#eef0f3] p-3">
                <dt className="text-xs text-[#667085]">原收款金额与方式</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {formatMoney(context.payment.amountFen)} ·{" "}
                  {paymentMethodLabels[context.payment.method]}
                </dd>
              </div>
              <div className="border-b border-[#eef0f3] p-3 sm:border-r sm:border-b-0">
                <dt className="text-xs text-[#667085]">撤销后累计收款</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {formatMoney(receivedAfter)}
                </dd>
              </div>
              <div className="p-3">
                <dt className="text-xs text-[#667085]">撤销后未收金额</dt>
                <dd className="mt-1 font-semibold tabular-nums text-[#c62828]">
                  {formatMoney(remainingAfter)}
                </dd>
              </div>
              <div className="border-t border-[#eef0f3] bg-[#f8fafc] p-3 sm:col-span-2">
                <dt className="text-xs text-[#667085]">预计结算状态</dt>
                <dd className="mt-1 font-semibold">{statusAfter}</dd>
              </div>
            </dl>

            <label className="grid gap-2 text-[13px] font-semibold text-[#475467]">
              <span>
                撤销原因 <span className="text-[#c62828]">*</span>
              </span>
              <Textarea
                ref={reason}
                name="reason"
                required
                rows={4}
                maxLength={1_000}
                value={reasonValue}
                onChange={(event) => setReasonValue(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors?.reason)}
                aria-describedby={
                  state.fieldErrors?.reason ? "payment-reversal-reason-error" : undefined
                }
                placeholder="请说明为什么撤销这笔收款"
                className="resize-y"
              />
              {state.fieldErrors?.reason?.[0] ? (
                <small id="payment-reversal-reason-error" className="text-[#c62828]">
                  {state.fieldErrors.reason[0]}
                </small>
              ) : null}
            </label>
          </div>
          <footer className="sticky bottom-0 flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] bg-white px-[18px] py-[11px]">
            <Button onClick={onClose} disabled={pending}>
              返回
            </Button>
            <Button variant="danger" type="submit" disabled={pending}>
              {pending ? "正在撤销…" : "撤销这笔收款"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function PaymentReversalTrigger({
  context,
  submissionKey,
}: {
  context: PaymentReversalContext;
  submissionKey: string;
}) {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) returnFocus.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    returnFocus.current = event.currentTarget;
    setOpen(true);
  }

  return (
    <>
      <button
        ref={returnFocus}
        type="button"
        className="inline-flex min-h-11 shrink-0 items-center rounded-[7px] px-3 text-sm font-semibold text-[#c62828] hover:bg-[#fff0f0]"
        onClick={openDialog}
      >
        撤销收款
      </button>
      {open ? (
        <PaymentReversalDialog
          context={context}
          submissionKey={submissionKey}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
