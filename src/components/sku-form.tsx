"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";

import {
  createSkuAction,
  type SkuActionState,
  updateSkuAction,
} from "@/app/(workspace)/skus/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

const initialState: SkuActionState = { status: "idle" };

type EditableSku = {
  id: string;
  skuCode: string;
  name: string;
  category: string;
  inventoryUnit: string;
  referencePrice: string;
  warningThreshold: number;
  enabled: boolean;
};

function Field({
  label,
  name,
  errors,
  children,
  hint,
}: {
  label: string;
  name: string;
  errors?: string[];
  children: ReactNode;
  hint?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <label className="grid gap-2 text-[13px] font-semibold text-[#475467]">
      <span>
        {label} <b className="text-[#c62828]">*</b>
      </span>
      {children}
      {hint ? <span className="text-xs font-normal text-[#667085]">{hint}</span> : null}
      {errors?.[0] ? (
        <span id={errorId} className="text-xs font-normal text-[#c62828]">
          {errors[0]}
        </span>
      ) : null}
    </label>
  );
}

export function SkuForm({ sku }: { sku?: EditableSku }) {
  const mode = sku ? "edit" : "create";
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createSkuAction : updateSkuAction,
    initialState,
  );
  const [dirty, setDirty] = useState(false);
  const [referencePrice, setReferencePrice] = useState(sku?.referencePrice ?? "");

  useEffect(() => {
    if (state.status !== "error") return;
    document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [state]);

  useUnsavedChangesGuard(dirty);

  const invalid = (name: string) => Boolean(state.fieldErrors?.[name]);
  const describedBy = (name: string) => (invalid(name) ? `${name}-error` : undefined);

  return (
    <form action={formAction} className="grid gap-5" onChange={() => setDirty(true)}>
      {sku ? <input type="hidden" name="skuId" value={sku.id} /> : null}
      {state.status === "error" && state.message ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]">
          <IconAlertCircle aria-hidden size={18} />
          {state.message}
        </div>
      ) : null}

      <section className="grid gap-5 rounded-lg border border-[#e4e7ec] bg-white p-5 sm:grid-cols-2">
        <Field
          label="SKU 编码"
          name="skuCode"
          errors={state.fieldErrors?.skuCode}
          hint={sku ? "SKU 编码创建后不可修改。" : undefined}
        >
          <Input
            name="skuCode"
            defaultValue={sku?.skuCode}
            disabled={Boolean(sku)}
            aria-invalid={invalid("skuCode")}
            aria-describedby={describedBy("skuCode")}
            className="font-mono"
          />
        </Field>
        <Field label="名称" name="name" errors={state.fieldErrors?.name}>
          <Input name="name" defaultValue={sku?.name} aria-invalid={invalid("name")} aria-describedby={describedBy("name")} />
        </Field>
        <Field label="分类" name="category" errors={state.fieldErrors?.category}>
          <Input name="category" defaultValue={sku?.category} aria-invalid={invalid("category")} aria-describedby={describedBy("category")} />
        </Field>
        <Field label="库存单位" name="inventoryUnit" errors={state.fieldErrors?.inventoryUnit} hint="一个 SKU 始终使用同一整数计量口径。">
          <Input name="inventoryUnit" defaultValue={sku?.inventoryUnit} disabled={Boolean(sku)} aria-invalid={invalid("inventoryUnit")} aria-describedby={describedBy("inventoryUnit")} />
        </Field>
        <Field label="参考售价（元）" name="referencePrice" errors={state.fieldErrors?.referencePrice} hint="人民币含税金额，最多精确到分。">
          <Input
            name="referencePrice"
            inputMode="decimal"
            value={referencePrice}
            onChange={(event) => setReferencePrice(event.target.value)}
            onBlur={() => {
              if (/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(referencePrice)) {
                setReferencePrice(Number(referencePrice).toFixed(2));
              }
            }}
            aria-invalid={invalid("referencePrice")}
            aria-describedby={describedBy("referencePrice")}
          />
        </Field>
        <Field label="预警值" name="warningThreshold" errors={state.fieldErrors?.warningThreshold} hint="可用量小于或等于该非负整数时触发库存预警。">
          <Input name="warningThreshold" inputMode="numeric" defaultValue={sku?.warningThreshold ?? 0} aria-invalid={invalid("warningThreshold")} aria-describedby={describedBy("warningThreshold")} />
        </Field>
        {mode === "create" ? (
          <label className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-3 text-sm text-[#344054] sm:col-span-2">
            <Checkbox id="sku-enabled" name="enabled" defaultChecked />
            启用 SKU
          </label>
        ) : (
          <div className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] bg-[#f7f9fb] px-3 text-sm text-[#344054] sm:col-span-2">
            状态：<strong>{sku?.enabled ? "启用" : "停用"}</strong>
            <span className="text-xs text-[#667085]">状态变更使用详情页的专门操作。</span>
          </div>
        )}
      </section>

      <div className="flex justify-end gap-2.5">
        <Link href={sku ? `/skus/${sku.id}` : "/skus"} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]">
          {sku ? "取消编辑" : "返回列表"}
        </Link>
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "保存中…" : mode === "create" ? "创建 SKU" : "保存资料"}
        </Button>
      </div>
    </form>
  );
}
