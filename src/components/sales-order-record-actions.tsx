"use client";

import { IconAlertCircle, IconX } from "@tabler/icons-react";
import { useActionState, useEffect, useRef, useState, type MouseEvent } from "react";

import {
  deleteSalesOrderDraftAction,
  type SalesOrderActionState,
} from "@/app/(workspace)/sales-orders/actions";
import { Button } from "@/components/ui/button";
import { keepFocusInDialog } from "@/lib/dialog-focus";

const initialState: SalesOrderActionState = { status: "idle" };

function DeleteDialog({
  salesOrder,
  onClose,
}: {
  salesOrder: { id: string; salesOrderNumber: string; customerName: string };
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(deleteSalesOrderDraftAction, initialState);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => closeButton.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4 max-md:items-end max-md:p-0" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label="删除销售单草稿" onKeyDown={(event) => keepFocusInDialog(event, onClose)} className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:rounded-t-[14px] max-md:rounded-b-none">
        <header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px]"><h2 className="text-lg font-bold">删除销售单草稿</h2><button ref={closeButton} type="button" aria-label="关闭" className="grid size-11 place-items-center rounded-lg hover:bg-[#f2f4f7]" onClick={onClose}><IconX aria-hidden size={20} /></button></header>
        <form action={formAction}>
          <input type="hidden" name="salesOrderId" value={salesOrder.id} />
          <div className="grid gap-4 p-5">
            {state.status === "error" && state.message ? <div role="alert" className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"><IconAlertCircle aria-hidden size={18} />{state.message}</div> : null}
            <p className="text-sm leading-6 text-[#344054]">将删除 <strong>{salesOrder.salesOrderNumber}</strong>（{salesOrder.customerName}）草稿及其销售明细。删除动作会保留在业务审计中。</p>
          </div>
          <footer className="flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] px-[18px] py-[11px]"><Button onClick={onClose}>返回</Button><Button variant="danger" type="submit" disabled={pending}>{pending ? "删除中…" : "确认删除"}</Button></footer>
        </form>
      </section>
    </div>
  );
}

export function SalesOrderRecordActions({
  salesOrder,
}: {
  salesOrder: { id: string; salesOrderNumber: string; customerName: string };
}) {
  const [deleting, setDeleting] = useState(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!deleting) returnFocus.current?.focus();
  }, [deleting]);
  function openDelete(event: MouseEvent<HTMLButtonElement>) {
    returnFocus.current = event.currentTarget;
    setDeleting(true);
  }

  return <><Button variant="ghost" className="text-[#c62828] hover:bg-[#fff0f0]" onClick={openDelete}>删除</Button>{deleting ? <DeleteDialog salesOrder={salesOrder} onClose={() => setDeleting(false)} /> : null}</>;
}
