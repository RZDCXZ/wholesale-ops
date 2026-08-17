"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";

import type { Role } from "@/application/auth/resolve-actor";
import {
  createAccountAction,
  updateAccountRolesAction,
  type AccountActionState,
} from "@/app/(workspace)/settings/accounts/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: "OWNER", label: "老板" },
  { value: "SALES", label: "销售" },
  { value: "WAREHOUSE", label: "仓库" },
  { value: "FINANCE", label: "财务" },
];

const initialState: AccountActionState = { status: "idle" };

function FieldError({ errors, id }: { errors?: string[]; id?: string }) {
  return errors?.[0] ? (
    <span id={id} className="text-xs font-normal text-[#c62828]">
      {errors[0]}
    </span>
  ) : null;
}

function Field({
  label,
  children,
  errors,
  errorId,
}: {
  label: string;
  children: ReactNode;
  errors?: string[];
  errorId?: string;
}) {
  return (
    <label className="grid gap-2 text-[13px] font-semibold text-[#475467]">
      <span>
        {label} <b className="text-[#c62828]">*</b>
      </span>
      {children}
      <FieldError id={errorId} errors={errors} />
    </label>
  );
}

function RoleFields({
  defaultRoles = [],
  errors,
}: {
  defaultRoles?: Role[];
  errors?: string[];
}) {
  const invalid = Boolean(errors?.[0]);

  return (
    <fieldset
      className="grid gap-2"
      tabIndex={invalid ? -1 : undefined}
      aria-invalid={invalid}
      aria-describedby={invalid ? "roles-error" : undefined}
    >
      <legend className="text-[13px] font-semibold text-[#475467]">
        固定角色 <b className="text-[#c62828]">*</b>
      </legend>
      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        {roleOptions.map(({ value, label }) => (
          <label
            key={value}
            className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-3 text-sm text-[#344054]"
          >
            <Checkbox
              id={`account-role-${value}`}
              name="roles"
              value={value}
              defaultChecked={defaultRoles.includes(value)}
            />
            {label}
          </label>
        ))}
      </div>
      <FieldError id="roles-error" errors={errors} />
    </fieldset>
  );
}

export function AccountForm({
  mode,
  account,
}: {
  mode: "create" | "edit";
  account?: { id: string; name: string; email: string; roles: Role[] };
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createAccountAction : updateAccountRolesAction,
    initialState,
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.status !== "error") return;
    document
      .querySelector<HTMLElement>("[aria-invalid='true']")
      ?.focus();
  }, [state]);

  useUnsavedChangesGuard(dirty);

  return (
    <form
      action={formAction}
      className="grid gap-5"
      onChange={() => setDirty(true)}
    >
      {account ? <input type="hidden" name="accountId" value={account.id} /> : null}
      {state.status === "error" && state.message ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"
        >
          <IconAlertCircle aria-hidden size={18} />
          {state.message}
        </div>
      ) : null}

      <section className="grid gap-5 rounded-lg border border-[#e4e7ec] bg-white p-5">
        {mode === "create" ? (
          <>
            <Field
              label="姓名"
              errors={state.fieldErrors?.name}
              errorId="name-error"
            >
              <Input
                name="name"
                autoComplete="off"
                aria-invalid={Boolean(state.fieldErrors?.name)}
                aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
              />
            </Field>
            <Field
              label="邮箱"
              errors={state.fieldErrors?.email}
              errorId="email-error"
            >
              <Input
                name="email"
                type="email"
                autoComplete="off"
                aria-invalid={Boolean(state.fieldErrors?.email)}
                aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
              />
            </Field>
            <Field
              label="初始密码"
              errors={state.fieldErrors?.password}
              errorId="password-error"
            >
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(state.fieldErrors?.password)}
                aria-describedby={
                  state.fieldErrors?.password ? "password-error" : undefined
                }
              />
            </Field>
          </>
        ) : (
          <dl className="grid gap-4 rounded-[7px] bg-[#f7f9fb] p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[#667085]">姓名</dt>
              <dd className="mt-1 font-semibold">{account?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#667085]">邮箱</dt>
              <dd className="mt-1 font-semibold">{account?.email}</dd>
            </div>
          </dl>
        )}

        <RoleFields
          defaultRoles={account?.roles}
          errors={state.fieldErrors?.roles}
        />
        {mode === "edit" ? (
          <p className="text-[13px] leading-6 text-[#667085]">
            保存后立即按全部已分配角色的权限并集生效，不提供角色模式切换。
          </p>
        ) : null}
      </section>

      <div className="flex justify-end gap-2.5">
        <Link
          href="/settings/accounts"
          className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]"
        >
          返回列表
        </Link>
        <Button variant="primary" type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? "创建中…"
              : "保存中…"
            : mode === "create"
              ? "创建账号"
              : "保存角色"}
        </Button>
      </div>
    </form>
  );
}
