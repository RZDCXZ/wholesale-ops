"use client";

import { IconAlertCircle, IconLockOpen, IconX } from "@tabler/icons-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import {
  cancelSalesOrderAction,
  type SalesOrderActionState,
} from "@/app/(workspace)/sales-orders/actions";
import type { SalesOrderCancellationPreviewItem } from "@/application/sales-orders/sales-order-service";
import { Button } from "@/components/ui/button";
import { keepFocusInDialog } from "@/lib/dialog-focus";
import { formatQuantity } from "@/lib/format-quantity";

const initialState: SalesOrderActionState = { status: "idle" };

export type CancelableSalesOrder = {
  id: string;
  salesOrderNumber: string;
  customerName: string;
  items: SalesOrderCancellationPreviewItem[];
};

function CancelDialog({
  salesOrder,
  onClose,
}: {
  salesOrder: CancelableSalesOrder;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    cancelSalesOrderAction,
    initialState,
  );
  const [reasonValue, setReasonValue] = useState("");
  const reason = useRef<HTMLTextAreaElement | null>(null);

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
        aria-label="取消销售单"
        onKeyDown={(event) => {
          if (!pending) keepFocusInDialog(event, onClose);
        }}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:max-h-[92dvh] max-md:rounded-t-[14px] max-md:rounded-b-none"
      >
        <header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px] py-3.5">
          <div>
            <h2 className="text-lg font-bold">取消销售单</h2>
            <p className="mt-1 text-xs text-[#667085]">
              {salesOrder.salesOrderNumber} · {salesOrder.customerName}
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
          <input type="hidden" name="salesOrderId" value={salesOrder.id} />
          <div className="grid gap-4 p-5">
            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"
              >
                <IconAlertCircle aria-hidden className="mt-0.5 shrink-0" size={18} />
                <span>{state.message}</span>
              </div>
            ) : null}

            <div className="flex items-start gap-3 rounded-lg border border-[#edb1b1] bg-[#fff8f8] p-4 text-[13px] text-[#8a1c1c]">
              <IconLockOpen aria-hidden className="mt-0.5 shrink-0" size={19} />
              <div>
                <strong>将释放全部库存预占</strong>
                <p className="mt-1 leading-5">
                  现存量保持不变，可用量相应恢复；取消后销售单永久保留，不能重新启用、编辑、删除或再次取消。
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold">将释放的 SKU 与预占数量</h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-[#e4e7ec]">
                {salesOrder.items.map((item) => (
                  <div
                    key={item.skuId}
                    className="grid gap-2 border-b border-[#eef0f3] px-3 py-2.5 text-[13px] last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div>
                      <strong className="font-mono text-xs text-[#1d4ed8]">
                        {item.skuCode}
                      </strong>
                      <span className="ml-2 font-semibold">{item.skuName}</span>
                    </div>
                    <span className="font-semibold tabular-nums text-[#c62828]">
                      释放 {formatQuantity(item.quantity)} {item.inventoryUnit}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <label className="grid gap-2 text-[13px] font-semibold text-[#475467]">
              <span>
                取消原因 <span className="text-[#c62828]">*</span>
              </span>
              <textarea
                ref={reason}
                name="reason"
                required
                rows={4}
                value={reasonValue}
                onChange={(event) => setReasonValue(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors?.reason)}
                aria-describedby={
                  state.fieldErrors?.reason ? "cancel-reason-error" : undefined
                }
                placeholder="请说明取消原因"
                className="min-h-24 resize-y rounded-[7px] border border-[#d0d5dd] px-3 py-2.5 text-sm text-[#1d2939] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#bfdbfe] aria-invalid:border-[#d92d20]"
              />
              {state.fieldErrors?.reason?.[0] ? (
                <small id="cancel-reason-error" className="text-[#c62828]">
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
              {pending ? "正在取消…" : "取消并释放预占"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function SalesOrderCancelTrigger({
  salesOrder,
  className,
  label = "取消",
}: {
  salesOrder: CancelableSalesOrder;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) returnFocus.current?.focus();
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
        className={`inline-flex min-h-11 items-center justify-center rounded-[7px] px-3 text-sm font-semibold text-[#c62828] hover:bg-[#fff0f0] ${className ?? ""}`}
        onClick={openDialog}
      >
        {label}
      </button>
      {open ? (
        <CancelDialog salesOrder={salesOrder} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
