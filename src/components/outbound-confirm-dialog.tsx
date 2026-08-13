"use client";

import {
  IconAlertCircle,
  IconPackageExport,
  IconShieldCheck,
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
  outboundSalesOrderAction,
  type OutboundActionState,
} from "@/app/(workspace)/warehouse/outbound/actions";
import type { PendingOutboundSalesOrder } from "@/application/outbound/outbound-service";
import { Button } from "@/components/ui/button";
import { keepFocusInDialog } from "@/lib/dialog-focus";
import { formatQuantity } from "@/lib/format-quantity";

const initialState: OutboundActionState = { status: "idle" };

function OutboundDialog({
  task,
  returnTo,
  onClose,
}: {
  task: PendingOutboundSalesOrder;
  returnTo: "workbench" | "sales-order";
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    outboundSalesOrderAction,
    initialState,
  );
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const reservationComplete = task.items.every(
    (item) => item.reservationComplete,
  );

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
        aria-label="完成整单出库"
        onKeyDown={(event) => {
          if (!pending) keepFocusInDialog(event, onClose);
        }}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:max-h-[92dvh] max-md:rounded-t-[14px] max-md:rounded-b-none"
      >
        <header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px] py-3.5">
          <div>
            <h2 className="text-lg font-bold">完成整单出库</h2>
            <p className="mt-1 text-xs text-[#667085]">
              {task.salesOrderNumber} · {task.customer.name}
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
        <form action={formAction} className="min-h-0 overflow-y-auto">
          <input type="hidden" name="salesOrderId" value={task.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
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

            <div className="flex items-start gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 text-[13px] text-[#1e3a8a]">
              <IconPackageExport
                aria-hidden
                className="mt-0.5 shrink-0"
                size={19}
              />
              <div>
                <strong>必须整单出库，不能修改数量</strong>
                <p className="mt-1 leading-5">
                  服务端提交时会重新校验销售单仍为已确认、当前操作者有权执行，并且全部 SKU 的预占仍然完整。
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold">本次交付的全部 SKU</h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-[#e4e7ec]">
                {task.items.map((item) => (
                  <article
                    key={item.skuId}
                    className="grid gap-2 border-b border-[#eef0f3] px-3 py-3 text-[13px] last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div>
                      <strong className="font-mono text-xs text-[#1d4ed8]">
                        {item.skuCode}
                      </strong>
                      <span className="ml-2 font-semibold">{item.skuName}</span>
                      {!item.reservationComplete ? (
                        <small className="mt-1 block font-semibold text-[#c62828]">
                          当前预占不完整，请刷新任务后重试
                        </small>
                      ) : null}
                    </div>
                    <strong className="tabular-nums">
                      {formatQuantity(item.quantity)} {item.inventoryUnit}
                    </strong>
                  </article>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-[#a7d9b6] bg-[#f2faf4] p-4 text-[13px] text-[#027a48]">
              <IconShieldCheck
                aria-hidden
                className="mt-0.5 shrink-0"
                size={19}
              />
              <div>
                <strong>完成后现存量与预占量同时减少</strong>
                <p className="mt-1 leading-5">
                  系统会记录可追溯的库存活动，并自动生成一笔经营应收；经营与结算详情保持隐藏。
                </p>
              </div>
            </div>
          </div>
          <footer className="sticky bottom-0 flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] bg-white px-[18px] py-[11px]">
            <Button onClick={onClose} disabled={pending}>
              返回核对
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={pending || !reservationComplete}
            >
              {pending ? "正在出库…" : "完成整单出库"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function OutboundConfirmTrigger({
  task,
  label = "查看并出库",
  returnTo = "workbench",
  variant = "link",
  className,
}: {
  task: PendingOutboundSalesOrder;
  label?: string;
  returnTo?: "workbench" | "sales-order";
  variant?: "link" | "primary";
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
        className={`inline-flex min-h-11 items-center justify-center rounded-[7px] px-3 text-sm font-semibold ${
          variant === "primary"
            ? "border border-[#2563eb] bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            : "text-[#1d4ed8] hover:bg-[#eff6ff]"
        } ${className ?? ""}`}
        onClick={openDialog}
      >
        {label}
      </button>
      {open ? (
        <OutboundDialog
          task={task}
          returnTo={returnTo}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
