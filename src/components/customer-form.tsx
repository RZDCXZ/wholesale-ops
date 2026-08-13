"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";

import {
  createCustomerAction,
  type CustomerActionState,
  updateCustomerAction,
} from "@/app/(workspace)/customers/actions";
import { Button } from "@/components/ui/button";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

const initialState: CustomerActionState = { status: "idle" };

type EditableCustomer = {
  id: string;
  customerCode: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  responsibleSales: { id: string; name: string };
  paymentTermDays: number;
  enabled: boolean;
};

function Field({ label, name, errors, children, hint, wide }: {
  label: string;
  name: string;
  errors?: string[];
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={`grid gap-2 text-[13px] font-semibold text-[#475467] ${wide ? "sm:col-span-2" : ""}`}>
      <span>{label} <b className="text-[#c62828]">*</b></span>
      {children}
      {hint ? <span className="text-xs font-normal text-[#667085]">{hint}</span> : null}
      {errors?.[0] ? <span id={`${name}-error`} className="text-xs font-normal text-[#c62828]">{errors[0]}</span> : null}
    </label>
  );
}

const inputClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15 disabled:bg-[#f2f4f7] disabled:text-[#667085]";

export function CustomerForm({
  customer,
  responsibleSalesOptions,
  currentSales,
}: {
  customer?: EditableCustomer;
  responsibleSalesOptions: Array<{ id: string; name: string }>;
  currentSales?: { id: string; name: string };
}) {
  const mode = customer ? "edit" : "create";
  const [state, formAction, pending] = useActionState(mode === "create" ? createCustomerAction : updateCustomerAction, initialState);
  const [dirty, setDirty] = useState(false);
  const [paymentTermType, setPaymentTermType] = useState(
    !customer || customer.paymentTermDays === 0 ? "cash" : "credit",
  );
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    if (state.status === "error") document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [state]);

  const invalid = (name: string) => Boolean(state.fieldErrors?.[name]);
  const describedBy = (name: string) => invalid(name) ? `${name}-error` : undefined;
  const assignedSales = customer?.responsibleSales ?? currentSales;

  return (
    <form action={formAction} className="grid gap-5" onChange={() => setDirty(true)}>
      {customer ? <input type="hidden" name="customerId" value={customer.id} /> : null}
      {state.status === "error" && state.message ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"><IconAlertCircle aria-hidden size={18} />{state.message}</div>
      ) : null}

      <section className="grid gap-5 rounded-lg border border-[#e4e7ec] bg-white p-5 sm:grid-cols-2">
        <Field label="客户编码" name="customerCode" errors={state.fieldErrors?.customerCode} hint={customer ? "客户编码创建后不可修改。" : "创建后不可修改，例如 KH-0009。"}>
          <input aria-label="客户编码" name="customerCode" defaultValue={customer?.customerCode} disabled={Boolean(customer)} aria-invalid={invalid("customerCode")} aria-describedby={describedBy("customerCode")} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="客户名称" name="name" errors={state.fieldErrors?.name} hint="客户名称允许重复，以客户编码稳定识别。">
          <input aria-label="客户名称" name="name" defaultValue={customer?.name} aria-invalid={invalid("name")} aria-describedby={describedBy("name")} className={inputClass} />
        </Field>
        <Field label="联系人" name="contactName" errors={state.fieldErrors?.contactName}>
          <input aria-label="联系人" name="contactName" defaultValue={customer?.contactName} aria-invalid={invalid("contactName")} aria-describedby={describedBy("contactName")} className={inputClass} />
        </Field>
        <Field label="电话" name="phone" errors={state.fieldErrors?.phone}>
          <input aria-label="电话" name="phone" type="tel" defaultValue={customer?.phone} aria-invalid={invalid("phone")} aria-describedby={describedBy("phone")} className={inputClass} />
        </Field>
        <Field label="客户负责人" name="responsibleSalesId" errors={state.fieldErrors?.responsibleSalesId} hint={customer ? "负责人调整使用详情页的专门操作。" : currentSales ? "销售创建客户时，负责人固定为自己。" : "只能选择启用的销售账号。"}>
          {mode === "create" && !currentSales ? (
            <select aria-label="客户负责人" name="responsibleSalesId" defaultValue="" aria-invalid={invalid("responsibleSalesId")} aria-describedby={describedBy("responsibleSalesId")} className={inputClass}>
              <option value="" disabled>请选择客户负责人</option>
              {responsibleSalesOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          ) : (
            <><input aria-label="客户负责人" value={assignedSales?.name ?? ""} readOnly disabled className={inputClass} /><input type="hidden" name="responsibleSalesId" value={assignedSales?.id ?? ""} /></>
          )}
        </Field>
        <Field label="默认账期" name="paymentTermDays" errors={state.fieldErrors?.paymentTermDays} hint="现结表示交付当天到期；账期天数从交付日开始计算。">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <select aria-label="默认账期类型" name="paymentTermType" value={paymentTermType} onChange={(event) => setPaymentTermType(event.target.value)} className={inputClass}>
              <option value="cash">现结</option>
              <option value="credit">指定天数</option>
            </select>
            <div className="relative"><input aria-label="默认账期天数" name="paymentTermDays" inputMode="numeric" defaultValue={customer?.paymentTermDays || 30} disabled={paymentTermType === "cash"} aria-invalid={invalid("paymentTermDays")} aria-describedby={describedBy("paymentTermDays")} className={`${inputClass} w-full pr-10`} /><span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-[#667085]">天</span></div>
          </div>
        </Field>
        <Field label="地址" name="address" errors={state.fieldErrors?.address} wide>
          <textarea aria-label="地址" name="address" rows={3} defaultValue={customer?.address} aria-invalid={invalid("address")} aria-describedby={describedBy("address")} className={`${inputClass} resize-y py-3`} />
        </Field>
        {mode === "create" ? (
          <label className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-3 text-sm text-[#344054] sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked className="size-4 accent-[#2563eb]" />启用客户</label>
        ) : (
          <div className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] bg-[#f7f9fb] px-3 text-sm text-[#344054] sm:col-span-2">状态：<strong>{customer?.enabled ? "启用" : "停用"}</strong><span className="text-xs text-[#667085]">状态变更使用详情页的专门操作。</span></div>
        )}
      </section>

      <div className="flex justify-end gap-2.5">
        <Link href={customer ? `/customers/${customer.id}` : "/customers"} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054]">{customer ? "取消编辑" : "返回列表"}</Link>
        <Button variant="primary" type="submit" disabled={pending}>{pending ? "保存中…" : mode === "create" ? "创建客户" : "保存资料"}</Button>
      </div>
    </form>
  );
}
