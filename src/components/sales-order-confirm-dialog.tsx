"use client";

import { IconAlertCircle, IconLock, IconX } from "@tabler/icons-react";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  confirmSalesOrderAction,
  type SalesOrderActionState,
} from "@/app/(workspace)/sales-orders/actions";
import { Button } from "@/components/ui/button";
import { keepFocusInDialog } from "@/lib/dialog-focus";
import { formatMoney } from "@/lib/format-money";
import { formatSignedQuantity } from "@/lib/format-quantity";

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

type ConfirmationContextValue = {
  salesOrder: ConfirmableSalesOrder;
  state: SalesOrderActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
};

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

function useConfirmation(): ConfirmationContextValue {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error("Sales order confirmation components require a provider.");
  }
  return context;
}

export function SalesOrderConfirmationProvider({
  salesOrder,
  children,
}: {
  salesOrder: ConfirmableSalesOrder;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(
    confirmSalesOrderAction,
    initialState,
  );
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) returnFocus.current?.focus();
  }, [open]);

  return (
    <ConfirmationContext.Provider
      value={{
        salesOrder,
        state,
        formAction,
        pending,
        open,
        setOpen,
        returnFocus,
      }}
    >
      {children}
    </ConfirmationContext.Provider>
  );
}

function ShortageList({ state }: { state: SalesOrderActionState }) {
  return state.inventoryShortages?.length ? (
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
  ) : null;
}

function ConfirmationError({
  state,
  testId,
}: {
  state: SalesOrderActionState;
  testId?: string;
}) {
  if (state.status !== "error" || !state.message) return null;

  return (
    <div
      role="alert"
      data-testid={testId}
      className="rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-4 py-3 text-[13px] text-[#c62828]"
    >
      <div className="flex items-start gap-2 font-semibold">
        <IconAlertCircle aria-hidden className="mt-0.5 shrink-0" size={18} />
        <span>{state.message}</span>
      </div>
      <ShortageList state={state} />
    </div>
  );
}

export function SalesOrderConfirmationFeedback() {
  const { state, open } = useConfirmation();
  if (open || state.status !== "error" || !state.message) return null;
  return (
    <div className="mb-4">
      <ConfirmationError
        state={state}
        testId="sales-order-confirmation-feedback"
      />
    </div>
  );
}

export function SalesOrderInventoryRow({
  skuId,
  initiallyShort,
  children,
}: {
  skuId: string;
  initiallyShort: boolean;
  children: ReactNode;
}) {
  const { state } = useConfirmation();
  const hasLatestShortage = state.inventoryShortages?.some(
    (shortage) => shortage.skuId === skuId,
  );
  const hasShortage = hasLatestShortage || initiallyShort;

  return (
    <article
      data-testid={`sales-order-inventory-${skuId}`}
      className={`grid gap-3 rounded-lg border p-3.5 text-[13px] lg:grid-cols-[minmax(180px,1.2fr)_repeat(3,minmax(130px,1fr))] lg:items-center ${
        hasShortage
          ? "border-[#edb1b1] bg-[#fff8f8]"
          : "border-[#e4e7ec]"
      }`}
    >
      {children}
    </article>
  );
}

export function SalesOrderItemShortage({
  skuId,
  requiredQuantity,
  initialAvailableQuantity,
  inventoryUnit,
}: {
  skuId: string;
  requiredQuantity: number;
  initialAvailableQuantity: number;
  inventoryUnit: string;
}) {
  const { state } = useConfirmation();
  const latest = state.inventoryShortages?.find(
    (shortage) => shortage.skuId === skuId,
  );
  const availableQuantity = latest?.availableQuantity ?? initialAvailableQuantity;
  const shortageQuantity = Math.max(0, requiredQuantity - availableQuantity);
  if (shortageQuantity === 0) return null;

  return (
    <small className="mt-1 block font-semibold text-[#c62828]">
      需要 {requiredQuantity}，当前可用 {availableQuantity}，缺少 {shortageQuantity}{" "}
      {inventoryUnit}
    </small>
  );
}

export function SalesOrderInventoryImpacts({
  skuId,
  quantity,
  initialImpact,
  showDeltas = false,
}: {
  skuId: string;
  quantity: number;
  initialImpact: {
    onHandBefore: number;
    onHandAfter: number;
    reservedBefore: number;
    reservedAfter: number;
    availableBefore: number;
    availableAfter: number;
  };
  showDeltas?: boolean;
}) {
  const { state } = useConfirmation();
  const latest = state.inventoryShortages?.find(
    (shortage) => shortage.skuId === skuId,
  );
  const onHandBefore = latest?.onHandQuantity ?? initialImpact.onHandBefore;
  const onHandAfter = latest?.onHandQuantity ?? initialImpact.onHandAfter;
  const reservedBefore = latest?.reservedQuantity ?? initialImpact.reservedBefore;
  const reservedAfter = latest
    ? latest.reservedQuantity + quantity
    : initialImpact.reservedAfter;
  const availableBefore = latest?.availableQuantity ?? initialImpact.availableBefore;
  const availableAfter = latest
    ? latest.availableQuantity - quantity
    : initialImpact.availableAfter;

  return (
    <>
      <div className="rounded-md bg-[#f7f9fb] px-3 py-2">
        <span className="block text-xs text-[#667085]">现存量</span>
        <strong className="mt-1 block tabular-nums">
          {onHandBefore} → {onHandAfter}{" "}
          {showDeltas ? <small className="text-[#667085]">不变</small> : null}
        </strong>
      </div>
      <div className="rounded-md bg-[#f7f9fb] px-3 py-2">
        <span className="block text-xs text-[#667085]">预占量</span>
        <strong className="mt-1 block tabular-nums">
          {reservedBefore} → {reservedAfter}{" "}
          {showDeltas ? (
            <small className="text-[#027a48]">
              {formatSignedQuantity(quantity)}
            </small>
          ) : null}
        </strong>
      </div>
      <div
        className={
          availableAfter < 0
            ? "rounded-md bg-[#fff0f0] px-3 py-2 text-[#c62828]"
            : "rounded-md bg-[#ecfdf3] px-3 py-2 text-[#027a48]"
        }
      >
        <span className="block text-xs">可用量</span>
        <strong className="mt-1 block tabular-nums">
          {availableBefore} → {availableAfter}{" "}
          {showDeltas ? <small>{formatSignedQuantity(-quantity)}</small> : null}
        </strong>
      </div>
    </>
  );
}

function ConfirmDialog() {
  const { salesOrder, state, formAction, pending, setOpen } = useConfirmation();
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const shortageBySkuId = new Map(
    state.inventoryShortages?.map((shortage) => [shortage.skuId, shortage]),
  );
  const onClose = () => setOpen(false);

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
            <p className="mt-1 text-xs text-[#667085]">
              服务端会重新校验状态、权限、SKU 与最新可用量
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
          <input type="hidden" name="salesOrderId" value={salesOrder.id} />
          <div className="grid gap-4 p-5">
            <ConfirmationError state={state} />

            <dl className="grid gap-px overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#e4e7ec] text-[13px] sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-[#fafbfc] p-3">
                <dt className="text-xs text-[#667085]">销售单</dt>
                <dd className="mt-1 font-mono font-semibold">
                  {salesOrder.salesOrderNumber}
                </dd>
              </div>
              <div className="bg-[#fafbfc] p-3">
                <dt className="text-xs text-[#667085]">客户</dt>
                <dd className="mt-1 font-semibold">{salesOrder.customerName}</dd>
              </div>
              <div className="bg-[#fafbfc] p-3">
                <dt className="text-xs text-[#667085]">明细</dt>
                <dd className="mt-1 font-semibold">{salesOrder.items.length} 行</dd>
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
              <p className="mt-1 text-xs text-[#667085]">
                现存量不变；预占量增加；可用量减少。以下数字仅用于确认前核对，提交时会读取最新库存。
              </p>
            </div>
            <div className="grid gap-2">
              {salesOrder.items.map((item) => {
                const latestShortage = shortageBySkuId.get(item.skuId);
                return (
                  <article
                    key={item.skuId}
                    data-testid={`sales-order-confirm-dialog-inventory-${item.skuId}`}
                    className={`grid gap-3 rounded-lg border p-3 text-[13px] md:grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(120px,1fr))] md:items-center ${
                      latestShortage
                        ? "border-[#edb1b1] bg-[#fff8f8]"
                        : "border-[#e4e7ec]"
                    }`}
                  >
                    <div>
                      <strong className="font-mono text-xs text-[#1d4ed8]">
                        {item.skuCode}
                      </strong>
                      <span className="mt-1 block font-semibold">{item.skuName}</span>
                      <small className="mt-1 block text-[#667085]">
                        需要 {item.quantity} {item.inventoryUnit}
                      </small>
                      {latestShortage ? (
                        <small className="mt-1 block font-semibold text-[#c62828]">
                          当前可用 {latestShortage.availableQuantity}，缺少{" "}
                          {latestShortage.shortageQuantity} {item.inventoryUnit}
                        </small>
                      ) : null}
                    </div>
                    <SalesOrderInventoryImpacts
                      skuId={item.skuId}
                      quantity={item.quantity}
                      initialImpact={{
                        onHandBefore: item.onHandQuantity,
                        onHandAfter: item.onHandQuantity,
                        reservedBefore: item.reservedQuantity,
                        reservedAfter: item.reservedQuantity + item.quantity,
                        availableBefore: item.availableQuantity,
                        availableAfter: item.availableQuantity - item.quantity,
                      }}
                    />
                  </article>
                );
              })}
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 text-[13px] text-[#1e3a8a]">
              <IconLock aria-hidden className="mt-0.5 shrink-0" size={19} />
              <div>
                <strong>确认后业务内容冻结</strong>
                <p className="mt-1 leading-5">
                  客户快照、账期、SKU、数量与成交价不可再编辑；任一 SKU 不足时整单不会确认。
                </p>
              </div>
            </div>
          </div>
          <footer className="sticky bottom-0 flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] bg-white px-[18px] py-[11px]">
            <Button onClick={onClose} disabled={pending}>
              返回核对
            </Button>
            <Button variant="primary" type="submit" disabled={pending}>
              {pending ? "正在确认…" : "确认并预占库存"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function SalesOrderConfirmTrigger({ className }: { className?: string }) {
  const { open, setOpen, returnFocus } = useConfirmation();

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
      {open ? <ConfirmDialog /> : null}
    </>
  );
}
