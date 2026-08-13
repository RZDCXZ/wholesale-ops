"use client";

import { IconAlertCircle, IconPlus, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useActionState } from "react";

import type { Role } from "@/application/auth/resolve-actor";
import {
  createAccountAction,
  disableAccountAction,
  updateAccountRolesAction,
  type AccountActionState,
} from "@/app/(workspace)/settings/accounts/actions";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/role-badge";

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: "OWNER", label: "老板" },
  { value: "SALES", label: "销售" },
  { value: "WAREHOUSE", label: "仓库" },
  { value: "FINANCE", label: "财务" },
];

const initialAccountActionState: AccountActionState = { status: "idle" };

export type AccountView = {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  roles: Role[];
  lastSessionAt: string | null;
};

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; account: AccountView }
  | { kind: "disable"; account: AccountView }
  | null;

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4 max-md:items-end max-md:p-0"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-[600px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:max-h-[90dvh] max-md:rounded-t-[14px] max-md:rounded-b-none"
      >
        <header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px] py-3.5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            aria-label="关闭"
            className="grid size-11 place-items-center rounded-lg border-0 bg-transparent hover:bg-[#f2f4f7]"
            onClick={onClose}
          >
            <IconX aria-hidden size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function FormMessage({ state }: { state: AccountActionState }) {
  if (state.status !== "error" || !state.message) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"
    >
      <IconAlertCircle aria-hidden size={18} />
      {state.message}
    </div>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? (
    <span className="text-xs font-normal text-[#c62828]">{errors[0]}</span>
  ) : null;
}

function Field({
  label,
  children,
  errors,
}: {
  label: string;
  children: ReactNode;
  errors?: string[];
}) {
  return (
    <label className="grid gap-2 text-[13px] font-semibold text-[#475467]">
      <span>
        {label} <b className="text-[#c62828]">*</b>
      </span>
      {children}
      <FieldError errors={errors} />
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
  return (
    <fieldset className="grid gap-2">
      <legend className="text-[13px] font-semibold text-[#475467]">
        固定角色 <b className="text-[#c62828]">*</b>
      </legend>
      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        {roleOptions.map(({ value, label }) => (
          <label
            key={value}
            className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-3 text-sm text-[#344054]"
          >
            <input
              type="checkbox"
              name="roles"
              value={value}
              defaultChecked={defaultRoles.includes(value)}
              className="size-4 accent-[#2563eb]"
            />
            {label}
          </label>
        ))}
      </div>
      <FieldError errors={errors} />
    </fieldset>
  );
}

function CreateAccountDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    createAccountAction,
    initialAccountActionState,
  );

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state.status]);

  return (
    <Dialog title="新建账号" onClose={onClose}>
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        <div className="grid gap-4 overflow-y-auto p-5">
          <FormMessage state={state} />
          <Field label="姓名" errors={state.fieldErrors?.name}>
            <input
              name="name"
              autoComplete="off"
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-3 font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15"
            />
          </Field>
          <Field label="邮箱" errors={state.fieldErrors?.email}>
            <input
              name="email"
              type="email"
              autoComplete="off"
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-3 font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15"
            />
          </Field>
          <Field label="初始密码" errors={state.fieldErrors?.password}>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-3 font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15"
            />
          </Field>
          <RoleFields errors={state.fieldErrors?.roles} />
        </div>
        <footer className="flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] px-[18px] py-[11px]">
          <Button onClick={onClose}>返回</Button>
          <Button variant="primary" type="submit" disabled={pending}>
            {pending ? "创建中…" : "创建账号"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function EditRolesDialog({
  account,
  onClose,
}: {
  account: AccountView;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateAccountRolesAction,
    initialAccountActionState,
  );

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state.status]);

  return (
    <Dialog title="调整账号角色" onClose={onClose}>
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="accountId" value={account.id} />
        <div className="grid gap-4 overflow-y-auto p-5">
          <FormMessage state={state} />
          <div className="rounded-[7px] bg-[#f7f9fb] p-3.5">
            <strong className="block text-sm">{account.name}</strong>
            <span className="mt-1 block text-xs text-[#667085]">
              {account.email}
            </span>
          </div>
          <RoleFields
            defaultRoles={account.roles}
            errors={state.fieldErrors?.roles}
          />
          <p className="text-[13px] leading-6 text-[#667085]">
            保存后立即按全部已分配角色的权限并集生效，不提供角色模式切换。
          </p>
        </div>
        <footer className="flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] px-[18px] py-[11px]">
          <Button onClick={onClose}>返回</Button>
          <Button variant="primary" type="submit" disabled={pending}>
            {pending ? "保存中…" : "保存角色"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function DisableAccountDialog({
  account,
  onClose,
}: {
  account: AccountView;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    disableAccountAction,
    initialAccountActionState,
  );

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state.status]);

  return (
    <Dialog title="停用账号" onClose={onClose}>
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="accountId" value={account.id} />
        <div className="grid gap-4 overflow-y-auto p-5">
          <FormMessage state={state} />
          <p className="text-sm leading-6 text-[#344054]">
            停用 <strong>{account.name}</strong>（{account.email}）后，将立即撤销其已有会话，该账号也不能再次登录。
          </p>
          <label className="flex items-start gap-2.5 rounded-[7px] border border-[#edb1b1] bg-[#fff0f0] p-3 text-[13px] leading-5 text-[#8f1d1d]">
            <input
              type="checkbox"
              name="confirmed"
              value="yes"
              className="mt-0.5 size-4 accent-[#c62828]"
            />
            我确认停用此账号并撤销已有会话。
          </label>
          <FieldError errors={state.fieldErrors?.confirmed} />
        </div>
        <footer className="flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] px-[18px] py-[11px]">
          <Button onClick={onClose}>返回</Button>
          <Button variant="danger" type="submit" disabled={pending}>
            {pending ? "停用中…" : "确认停用"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function AccountStatus({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={
        enabled
          ? "inline-flex min-h-6 items-center rounded-md border border-[#a7d9b6] bg-[#ecfdf3] px-2 text-xs font-semibold text-[#027a48]"
          : "inline-flex min-h-6 items-center rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 text-xs font-semibold text-[#c62828]"
      }
    >
      {enabled ? "启用" : "停用"}
    </span>
  );
}

function AccountActions({
  account,
  setDialog,
}: {
  account: AccountView;
  setDialog: (dialog: DialogState) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        variant="ghost"
        className="min-h-9 px-2.5 text-[13px]"
        onClick={() => setDialog({ kind: "edit", account })}
      >
        编辑角色
      </Button>
      {account.enabled ? (
        <Button
          variant="ghost"
          className="min-h-9 px-2.5 text-[13px] text-[#c62828] hover:bg-[#fff0f0]"
          onClick={() => setDialog({ kind: "disable", account })}
        >
          停用
        </Button>
      ) : null}
    </div>
  );
}

export function AccountsManager({
  accounts,
  filters,
}: {
  accounts: AccountView[];
  filters: { query: string; role: string; status: string };
}) {
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-6 max-md:grid max-md:gap-3.5">
        <div>
          <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
            账号与角色
          </h1>
          <p className="mt-1.5 text-[13px] text-[#667085]">
            管理本地演示账号、启用状态与固定角色
          </p>
        </div>
        <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
          <IconPlus aria-hidden size={17} />
          新建账号
        </Button>
      </header>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form
          method="get"
          className="flex items-center gap-2.5 border-b border-[#e4e7ec] p-3.5 max-md:grid max-md:grid-cols-2"
        >
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="搜索姓名或邮箱"
            className="min-h-11 min-w-0 flex-1 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15 max-md:col-span-2"
          />
          <select
            name="role"
            defaultValue={filters.role}
            aria-label="角色"
            className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] text-[#344054]"
          >
            <option value="">全部角色</option>
            {roleOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={filters.status}
            aria-label="启用状态"
            className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] text-[#344054]"
          >
            <option value="">全部状态</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
          <Button type="submit">筛选</Button>
          <Link
            href="/settings/accounts"
            className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-3 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]"
          >
            清除
          </Link>
        </form>

        {accounts.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center">
            <div>
              <h2 className="text-base font-semibold">当前筛选无结果</h2>
              <p className="mt-2 text-[13px] text-[#667085]">
                请调整姓名、邮箱、角色或启用状态后重试。
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]">
                  <tr>
                    {[
                      "姓名",
                      "邮箱",
                      "角色",
                      "状态",
                      "最近会话",
                      "操作",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-b border-[#eef0f3] last:border-b-0">
                      <td className="px-4 py-3 font-semibold">{account.name}</td>
                      <td className="px-4 py-3 text-[#475467]">{account.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {account.roles.map((role) => (
                            <RoleBadge key={role} role={role} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <AccountStatus enabled={account.enabled} />
                      </td>
                      <td className="px-4 py-3 text-[#667085]">
                        {account.lastSessionAt ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <AccountActions account={account} setDialog={setDialog} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid divide-y divide-[#e4e7ec] md:hidden">
              {accounts.map((account) => (
                <article key={account.id} className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block text-sm">{account.name}</strong>
                      <span className="mt-1 block truncate text-xs text-[#667085]">
                        {account.email}
                      </span>
                    </div>
                    <AccountStatus enabled={account.enabled} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {account.roles.map((role) => (
                      <RoleBadge key={role} role={role} />
                    ))}
                  </div>
                  <span className="text-xs text-[#667085]">
                    最近会话：{account.lastSessionAt ?? "—"}
                  </span>
                  <AccountActions account={account} setDialog={setDialog} />
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {dialog?.kind === "create" ? (
        <CreateAccountDialog onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "edit" ? (
        <EditRolesDialog
          account={dialog.account}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "disable" ? (
        <DisableAccountDialog
          account={dialog.account}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
