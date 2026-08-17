"use client";

import { IconAlertCircle, IconX } from "@tabler/icons-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import {
  type CustomerActionState,
  deleteCustomerAction,
  disableCustomerAction,
  reassignCustomerAction,
} from "@/app/(workspace)/customers/actions";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { keepFocusInDialog } from "@/lib/dialog-focus";

const initialState: CustomerActionState = { status: "idle" };
type Action = "reassign" | "disable" | "delete";
const actionConfig = {
  reassign: {
    serverAction: reassignCustomerAction,
    title: "调整客户负责人",
    actionLabel: "确认转交",
    variant: "primary",
    description: (customer: string) =>
      `转交 ${customer} 后，原负责人将立即失去访问权限，新负责人立即获得访问权限。`,
  },
  disable: {
    serverAction: disableCustomerAction,
    title: "停用客户",
    actionLabel: "确认停用",
    variant: "danger",
    description: (customer: string) =>
      `停用 ${customer} 后，它不会再出现在新销售单的客户选择器中，历史资料保持可追溯。`,
  },
  delete: {
    serverAction: deleteCustomerAction,
    title: "删除客户",
    actionLabel: "确认删除",
    variant: "danger",
    description: (customer: string) =>
      `仅能删除尚未被业务记录引用的 ${customer}。若已有销售等业务引用，系统会拒绝删除并提示改为停用。`,
  },
} as const;

function ConfirmationDialog({ action, customer, salesOptions, onClose }: {
  action: Action;
  customer: { id: string; customerCode: string; name: string; responsibleSalesId: string };
  salesOptions: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const config = actionConfig[action];
  const [state, formAction, pending] = useActionState(
    config.serverAction,
    initialState,
  );
  const closeButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => closeButton.current?.focus(), []);
  const customerLabel = `${customer.customerCode} · ${customer.name}`;

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4 max-md:items-end max-md:p-0" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section role="dialog" aria-modal="true" aria-label={config.title} onKeyDown={(event) => keepFocusInDialog(event, onClose)} className="flex w-full max-w-[600px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:rounded-t-[14px] max-md:rounded-b-none"><header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px] py-3.5"><h2 className="text-lg font-bold">{config.title}</h2><button ref={closeButton} type="button" aria-label="关闭" className="grid size-11 place-items-center rounded-lg hover:bg-[#f2f4f7]" onClick={onClose}><IconX aria-hidden size={20} /></button></header><form action={formAction}><input type="hidden" name="customerId" value={customer.id} /><input type="hidden" name="confirmed" value="yes" /><div className="grid gap-4 p-5">{state.status === "error" && state.message ? <div role="alert" className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"><IconAlertCircle aria-hidden size={18} />{state.message}</div> : null}<p className="text-sm leading-6 text-[#344054]">{config.description(customerLabel)}</p>{action === "reassign" ? <label className="grid gap-2 text-[13px] font-semibold text-[#475467]">新的客户负责人<FormSelect name="responsibleSalesId" defaultValue="" options={[{ value: "", label: "请选择启用销售账号", disabled: true }, ...salesOptions.filter((option) => option.id !== customer.responsibleSalesId).map((option) => ({ value: option.id, label: option.name }))]} /></label> : null}</div><footer className="flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] px-[18px] py-[11px]"><Button onClick={onClose}>返回</Button><Button variant={config.variant} type="submit" disabled={pending}>{pending ? "处理中…" : config.actionLabel}</Button></footer></form></section></div>;
}

export function CustomerRecordActions({ customer, salesOptions, canReassign, canDelete }: {
  customer: { id: string; customerCode: string; name: string; enabled: boolean; responsibleSalesId: string };
  salesOptions: Array<{ id: string; name: string }>;
  canReassign: boolean;
  canDelete: boolean;
}) {
  const [action, setAction] = useState<Action>();
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!action) returnFocus.current?.focus();
  }, [action]);
  function openAction(nextAction: Action, event: MouseEvent<HTMLButtonElement>) {
    returnFocus.current = event.currentTarget;
    setAction(nextAction);
  }

  return <><div className="flex flex-wrap gap-2">{canReassign ? <Button onClick={(event) => openAction("reassign", event)}>调整负责人</Button> : null}{customer.enabled ? <Button variant="danger" onClick={(event) => openAction("disable", event)}>停用客户</Button> : null}{canDelete ? <Button variant="ghost" className="text-[#c62828] hover:bg-[#fff0f0]" onClick={(event) => openAction("delete", event)}>删除客户</Button> : null}</div>{action ? <ConfirmationDialog action={action} customer={customer} salesOptions={salesOptions} onClose={() => setAction(undefined)} /> : null}</>;
}
