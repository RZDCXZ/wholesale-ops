"use client";

import { IconAlertCircle, IconLock, IconX } from "@tabler/icons-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import {
  confirmSalesOrderAction,
  type SalesOrderActionState,
} from "@/app/(workspace)/sales-orders/actions";
import { Button } from "@/components/ui/button";
import { keepFocusInDialog } from "@/lib/dialog-focus";

const initialState: SalesOrderActionState = { status: "idle" };

export type ConfirmableSalesOrder = {
  id: string;
  salesOrderNumber: string;
  customerName: string;
  totalAmountFen: number;
  items: Array<{
    skuId: string;
    skuCode: string;
    skuName: string;
    inventoryUnit: string;
    quantity: number;
    onHandQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  }>;
};

function formatMoney(fen: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(fen / 100);
}

function ConfirmDialog({
  salesOrder,
  onClose,
}: {
  salesOrder: ConfirmableSalesOrder;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    confirmSalesOrderAction,
    initialState,
  );
  const closeButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => closeButton.current?.focus(), []);

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
        aria-label="确认销售单"
        onKeyDown={(event) => {
          if (!pending) keepFocusInDialog(event, onClose);
        }}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[760px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:max-h-[92dvh] max-md:rounded-t-[14px] max-md:rounded-b-none"
      >
        <header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px] py-3.5">
          <div>
            <h2 className="text-lg font-bold">确认销售单</h2>
            <p className="mt-1 text-xs text-[#667085]">服务端会重新校验状态、权限、SKU 与最新可用量</p>
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
        <form action={formAction} className="min-h-0 overflow-y-auto">
          <input type="hidden" name="salesOrderId" value={salesOrder.id} />
          <div className="grid gap-4 p-5">
            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-4 py-3 text-[13px] text-[#c62828]"
              >
                <div className="flex items-start gap-2 font-semibold">
                  <IconAlertCircle aria-hidden className="mt-0.5 shrink-0" size={18} />
                  <span>{state.message}</span>
                </div>
                {state.inventoryShortages?.length ? (
                  <ul className="mt-3 grid gap-2 pl-6">
                    {state.inventoryShortages.map((shortage) => (
                      <li key={shortage.skuId}>
                        <strong>{shortage.skuCode}</strong> 需要 {shortage.requiredQuantity}{" "}
                        {shortage.inventoryUnit}，当前可用量 {shortage.availableQuantity}{" "}
                        {shortage.inventoryUnit}，缺少 {shortage.shortageQuantity}{" "}
                        {shortage.inventoryUnit}。
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <dl className="grid gap-px overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#e4e7ec] text-[13px] sm:grid-cols-3">
              <div className="bg-[#fafbfc] p-3">
                <dt className="text-xs text-[#667085]">销售单</dt>
                <dd className="mt-1 font-mono font-semibold">{salesOrder.salesOrderNumber}</dd>
              </div>
              <div className="bg-[#fafbfc] p-3">
                <dt className="text-xs text-[#667085]">客户</dt>
                <dd className="mt-1 font-semibold">{salesOrder.customerName}</dd>
              </div>
              <div className="bg-[#fafbfc] p-3">
                <dt className="text-xs text-[#667085]">成交金额</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {formatMoney(salesOrder.totalAmountFen)}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="text-sm font-bold">各 SKU 库存影响</h3>
              <p className="mt-1 text-xs text-[#667085]">现存量不变；预占量增加；可用量减少。以下数字仅用于确认前核对，提交时会读取最新库存。</p>
            </div>
            <div className="grid gap-2">
              {salesOrder.items.map((item) => {
                const availableAfter = item.availableQuantity - item.quantity;
                return (
                  <article
                    key={item.skuId}
                    className="grid gap-3 rounded-lg border border-[#e4e7ec] p-3 text-[13px] md:grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(120px,1fr))] md:items-center"
                  >
                    <div>
                      <strong className="font-mono text-xs text-[#1d4ed8]">{item.skuCode}</strong>
                      <span className="mt-1 block font-semibold">{item.skuName}</span>
                      <small className="mt-1 block text-[#667085]">需要 {item.quantity} {item.inventoryUnit}</small>
                    </div>
                    <div className="rounded-md bg-[#f7f9fb] px-3 py-2">
                      <span className="block text-xs text-[#667085]">现存量</span>
                      <strong className="mt-1 block tabular-nums">{item.onHandQuantity} → {item.onHandQuantity}</strong>
                    </div>
                    <div className="rounded-md bg-[#f7f9fb] px-3 py-2">
                      <span className="block text-xs text-[#667085]">预占量</span>
                      <strong className="mt-1 block tabular-nums">{item.reservedQuantity} → {item.reservedQuantity + item.quantity}</strong>
                    </div>
                    <div className={availableAfter < 0 ? "rounded-md bg-[#fff0f0] px-3 py-2 text-[#c62828]" : "rounded-md bg-[#ecfdf3] px-3 py-2 text-[#027a48]"}>
                      <span className="block text-xs">可用量</span>
                      <strong className="mt-1 block tabular-nums">{item.availableQuantity} → {availableAfter}</strong>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 text-[13px] text-[#1e3a8a]">
              <IconLock aria-hidden className="mt-0.5 shrink-0" size={19} />
              <div><strong>确认后业务内容冻结</strong><p className="mt-1 leading-5">客户快照、账期、SKU、数量与成交价不可再编辑；任一 SKU 不足时整单不会确认。</p></div>
            </div>
          </div>
          <footer className="sticky bottom-0 flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] bg-white px-[18px] py-[11px]">
            <Button onClick={onClose} disabled={pending}>返回核对</Button>
            <Button variant="primary" type="submit" disabled={pending}>
              {pending ? "正在确认…" : "确认并预占库存"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function SalesOrderConfirmDialog({
  salesOrder,
  className,
}: {
  salesOrder: ConfirmableSalesOrder;
  className?: string;
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
        className={`inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#2563eb] bg-[#2563eb] px-4 text-sm font-semibold whitespace-nowrap text-white hover:bg-[#1d4ed8] ${className ?? ""}`}
        onClick={openDialog}
      >
        确认销售单
      </button>
      {open ? (
        <ConfirmDialog salesOrder={salesOrder} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
