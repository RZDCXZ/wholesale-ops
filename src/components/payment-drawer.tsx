"use client";

import {
  IconAlertCircle,
  IconCircleCheck,
  IconWallet,
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
  recordPaymentAction,
  type PaymentActionState,
} from "@/app/(workspace)/receivables/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { keepFocusInDialog } from "@/lib/dialog-focus";
import { formatMoney } from "@/lib/format-money";
import {
  paymentMethodLabels,
  paymentMethodValues,
} from "@/lib/receivable-display";

const initialState: PaymentActionState = { status: "idle" };

function amountInputToFen(value: string): number | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{0,2})?$/.test(value.trim())) return null;
  const [yuan, fraction = ""] = value.trim().split(".");
  const amountFen = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amountFen) && amountFen > 0 ? amountFen : null;
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  return messages?.length ? (
    <span id={id} className="text-xs font-semibold text-[#c62828]">
      {messages.join(" ")}
    </span>
  ) : null;
}

function PaymentDrawer({
  receivable,
  submissionKey,
  today,
  onClose,
}: {
  receivable: {
    id: string;
    receivableNumber: string;
    remainingAmountFen: number;
  };
  submissionKey: string;
  today: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    recordPaymentAction,
    initialState,
  );
  const [amount, setAmount] = useState("");
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const amountFen = amountInputToFen(amount);
  const validAmount =
    amountFen !== null && amountFen <= receivable.remainingAmountFen;
  const remainingAfter = validAmount
    ? receivable.remainingAmountFen - amountFen
    : receivable.remainingAmountFen;

  useEffect(() => closeButton.current?.focus(), []);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/35"
      onMouseDown={(event) =>
        !pending && event.target === event.currentTarget && onClose()
      }
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="登记收款"
        onKeyDown={(event) => {
          if (!pending) keepFocusInDialog(event, onClose);
        }}
        className="flex h-full w-full max-w-[470px] flex-col bg-white shadow-2xl max-sm:max-w-none"
      >
        <header className="flex min-h-[66px] items-center justify-between border-b border-[#e4e7ec] px-5 py-3.5">
          <div>
            <h2 className="text-lg font-bold">登记收款</h2>
            <p className="mt-1 font-mono text-xs text-[#667085]">
              {receivable.receivableNumber}
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            aria-label="关闭"
            disabled={pending}
            className="grid size-11 place-items-center rounded-lg hover:bg-[#f2f4f7] disabled:opacity-50"
            onClick={onClose}
          >
            <IconX aria-hidden size={20} />
          </button>
        </header>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="receivableId" value={receivable.id} />
          <input type="hidden" name="idempotencyKey" value={submissionKey} />
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"
              >
                <IconAlertCircle aria-hidden className="mt-0.5 shrink-0" size={18} />
                <span>{state.message}</span>
              </div>
            ) : null}

            <div className="mb-5 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4">
              <span className="text-xs font-semibold text-[#475467]">
                当前未收金额
              </span>
              <strong className="mt-1 block text-2xl tabular-nums text-[#1d4ed8]">
                {formatMoney(receivable.remainingAmountFen)}
              </strong>
              <p className="mt-2 text-xs leading-5 text-[#475467]">
                一笔收款只关联当前应收；系统不创建预收款、客户余额或跨应收分摊。
              </p>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
                <span>收款日期 <b className="text-[#c62828]">*</b></span>
                <DatePicker
                  name="paymentDate"
                  value={today}
                  invalid={Boolean(state.fieldErrors?.paymentDate)}
                  describedBy={state.fieldErrors?.paymentDate ? "payment-date-error" : undefined}
                />
                <FieldError id="payment-date-error" messages={state.fieldErrors?.paymentDate} />
              </label>

              <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
                <span>金额 <b className="text-[#c62828]">*</b></span>
                <div className="flex gap-2 max-sm:flex-col">
                  <Input
                    name="amountFen"
                    inputMode="decimal"
                    required
                    value={amount}
                    placeholder="¥0.00"
                    aria-invalid={Boolean(state.fieldErrors?.amountFen)}
                    aria-describedby={state.fieldErrors?.amountFen ? "payment-amount-error" : undefined}
                    onChange={(event) => setAmount(event.target.value)}
                    className="min-w-0 flex-1 tabular-nums"
                  />
                  <Button
                    variant="ghost"
                    className="shrink-0 text-xs text-[#1d4ed8]"
                    onClick={() => setAmount((receivable.remainingAmountFen / 100).toFixed(2))}
                  >
                    填入全部未收金额
                  </Button>
                </div>
                <FieldError id="payment-amount-error" messages={state.fieldErrors?.amountFen} />
              </label>

              <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
                <span>收款方式 <b className="text-[#c62828]">*</b></span>
                <FormSelect
                  name="method"
                  defaultValue="BANK_TRANSFER"
                  aria-invalid={Boolean(state.fieldErrors?.method)}
                  aria-describedby={state.fieldErrors?.method ? "payment-method-error" : undefined}
                  options={paymentMethodValues.map((method) => ({ value: method, label: paymentMethodLabels[method] }))}
                />
                <FieldError id="payment-method-error" messages={state.fieldErrors?.method} />
              </label>

              <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
                <span>参考号 <em className="font-normal not-italic text-[#98a2b3]">（可选）</em></span>
                <Input
                  name="referenceNumber"
                  maxLength={160}
                  placeholder="例如银行流水号"
                />
                <FieldError id="payment-reference-error" messages={state.fieldErrors?.referenceNumber} />
              </label>

              <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
                <span>备注 <em className="font-normal not-italic text-[#98a2b3]">（可选）</em></span>
                <Textarea
                  name="note"
                  rows={3}
                  maxLength={1_000}
                  placeholder="补充本次收款的经营说明"
                />
                <FieldError id="payment-note-error" messages={state.fieldErrors?.note} />
              </label>
            </div>

            <div className="mt-5 grid gap-2 rounded-lg border border-[#e4e7ec] bg-[#f8fafc] p-4 text-[13px]">
              <div className="flex justify-between gap-4"><span className="text-[#667085]">本次收款</span><strong className="tabular-nums">{amountFen ? formatMoney(amountFen) : "—"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-[#667085]">登记后未收金额</span><strong className="tabular-nums">{validAmount ? formatMoney(remainingAfter) : "—"}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-[#667085]">预计结算状态</span><strong>{validAmount ? (remainingAfter === 0 ? "已结清" : "部分收款") : "—"}</strong></div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#a7d9b6] bg-[#f2faf4] p-3 text-xs leading-5 text-[#027a48]">
              <IconCircleCheck aria-hidden className="mt-0.5 shrink-0" size={17} />
              <span>提交后收款记录不可编辑或删除；累计等于原始金额时，应收会自动结清。</span>
            </div>
          </div>

          <footer className="flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] bg-white px-5 py-[11px]">
            <Button onClick={onClose} disabled={pending}>取消</Button>
            <Button variant="primary" type="submit" disabled={pending}>
              <IconWallet aria-hidden size={18} />
              {pending ? "正在登记…" : "登记收款"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function PaymentDrawerTrigger({
  receivable,
  submissionKey,
  today,
  label = "登记收款",
  className,
}: {
  receivable: {
    id: string;
    receivableNumber: string;
    remainingAmountFen: number;
  };
  submissionKey: string;
  today: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) returnFocus.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function openDrawer(event: MouseEvent<HTMLButtonElement>) {
    returnFocus.current = event.currentTarget;
    setOpen(true);
  }

  return (
    <>
      <button
        ref={returnFocus}
        type="button"
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8] ${className ?? ""}`}
        onClick={openDrawer}
      >
        <IconWallet aria-hidden size={18} />
        {label}
      </button>
      {open ? (
        <PaymentDrawer
          receivable={receivable}
          submissionKey={submissionKey}
          today={today}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
