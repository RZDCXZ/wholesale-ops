"use client";

import { IconAlertCircle, IconX } from "@tabler/icons-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  deleteSkuAction,
  disableSkuAction,
  type SkuActionState,
} from "@/app/(workspace)/skus/actions";
import { Button } from "@/components/ui/button";
import { keepFocusInDialog } from "@/lib/dialog-focus";

const initialState: SkuActionState = { status: "idle" };

function ConfirmationDialog({
  action,
  sku,
  onClose,
}: {
  action: "disable" | "delete";
  sku: { id: string; skuCode: string; name: string };
  onClose: () => void;
}) {
  const serverAction = action === "disable" ? disableSkuAction : deleteSkuAction;
  const [state, formAction, pending] = useActionState(serverAction, initialState);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => closeButton.current?.focus(), []);
  const title = action === "disable" ? "停用 SKU" : "删除 SKU";
  const actionLabel = action === "disable" ? "确认停用" : "确认删除";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4 max-md:items-end max-md:p-0" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => keepFocusInDialog(event, onClose)} className="flex w-full max-w-[600px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:rounded-t-[14px] max-md:rounded-b-none">
        <header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px] py-3.5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button ref={closeButton} type="button" aria-label="关闭" className="grid size-11 place-items-center rounded-lg hover:bg-[#f2f4f7]" onClick={onClose}>
            <IconX aria-hidden size={20} />
          </button>
        </header>
        <form action={formAction}>
          <input type="hidden" name="skuId" value={sku.id} />
          <input type="hidden" name="confirmed" value="yes" />
          <div className="grid gap-4 p-5">
            {state.status === "error" && state.message ? (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]">
                <IconAlertCircle aria-hidden size={18} />
                {state.message}
              </div>
            ) : null}
            <p className="text-sm leading-6 text-[#344054]">
              {action === "disable" ? (
                <>停用 <strong>{sku.skuCode} · {sku.name}</strong> 后，它不会再出现在销售选择目录中，历史资料保持可追溯。</>
              ) : (
                <>仅能删除尚未被业务记录引用的 <strong>{sku.skuCode} · {sku.name}</strong>。若已有引用，系统会拒绝删除并提示改为停用。</>
              )}
            </p>
          </div>
          <footer className="flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] px-[18px] py-[11px]">
            <Button onClick={onClose}>返回</Button>
            <Button variant="danger" type="submit" disabled={pending}>
              {pending ? "处理中…" : actionLabel}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function SkuRecordActions({
  sku,
}: {
  sku: {
    id: string;
    skuCode: string;
    name: string;
    enabled: boolean;
    canDelete: boolean;
  };
}) {
  const [action, setAction] = useState<"disable" | "delete">();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {sku.enabled ? <Button variant="danger" onClick={() => setAction("disable")}>停用 SKU</Button> : null}
        {sku.canDelete ? (
          <Button variant="ghost" className="text-[#c62828] hover:bg-[#fff0f0]" onClick={() => setAction("delete")}>删除 SKU</Button>
        ) : null}
      </div>
      {action ? <ConfirmationDialog action={action} sku={sku} onClose={() => setAction(undefined)} /> : null}
    </>
  );
}
