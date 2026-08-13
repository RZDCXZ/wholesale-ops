"use client";

import { IconAlertCircle, IconPlus, IconX } from "@tabler/icons-react";
import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Role } from "@/application/auth/resolve-actor";
import {
  disableAccountAction,
  type AccountActionState,
} from "@/app/(workspace)/settings/accounts/actions";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/role-badge";
import { keepFocusInDialog } from "@/lib/dialog-focus";

const initialActionState: AccountActionState = { status: "idle" };
const roleOptions: Array<{ value: Role; label: string }> = [
  { value: "OWNER", label: "老板" },
  { value: "SALES", label: "销售" },
  { value: "WAREHOUSE", label: "仓库" },
  { value: "FINANCE", label: "财务" },
];

export type AccountView = {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  roles: Role[];
  lastSessionAt: string | null;
};

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

function DisableAccountDialog({
  account,
  onClose,
}: {
  account: AccountView;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    disableAccountAction,
    initialActionState,
  );
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const confirmation = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  useEffect(() => {
    if (state.fieldErrors?.confirmed) confirmation.current?.focus();
  }, [state]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4 max-md:items-end max-md:p-0"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="停用账号"
        onKeyDown={(event) => keepFocusInDialog(event, onClose)}
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-[600px] flex-col overflow-hidden rounded-[10px] bg-white shadow-2xl max-md:max-h-[90dvh] max-md:rounded-t-[14px] max-md:rounded-b-none"
      >
        <header className="flex min-h-[62px] items-center justify-between border-b border-[#e4e7ec] px-[18px] py-3.5">
          <h2 className="text-lg font-bold">停用账号</h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="关闭"
            className="grid size-11 place-items-center rounded-lg border-0 bg-transparent hover:bg-[#f2f4f7]"
            onClick={onClose}
          >
            <IconX aria-hidden size={20} />
          </button>
        </header>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="accountId" value={account.id} />
          <div className="grid gap-4 overflow-y-auto p-5">
            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]"
              >
                <IconAlertCircle aria-hidden size={18} />
                {state.message}
              </div>
            ) : null}
            <p className="text-sm leading-6 text-[#344054]">
              停用 <strong>{account.name}</strong>（{account.email}）后，将立即撤销其已有会话，该账号也不能再次登录。
            </p>
            <label className="flex items-start gap-2.5 rounded-[7px] border border-[#edb1b1] bg-[#fff0f0] p-3 text-[13px] leading-5 text-[#8f1d1d]">
              <input
                ref={confirmation}
                type="checkbox"
                name="confirmed"
                value="yes"
                aria-invalid={Boolean(state.fieldErrors?.confirmed)}
                aria-describedby={
                  state.fieldErrors?.confirmed ? "disable-confirmation-error" : undefined
                }
                className="mt-0.5 size-4 accent-[#c62828]"
              />
              我确认停用此账号并撤销已有会话。
            </label>
            {state.fieldErrors?.confirmed?.[0] ? (
              <span
                id="disable-confirmation-error"
                className="text-xs text-[#c62828]"
              >
                {state.fieldErrors.confirmed[0]}
              </span>
            ) : null}
          </div>
          <footer className="flex min-h-[66px] justify-end gap-2.5 border-t border-[#e4e7ec] px-[18px] py-[11px]">
            <Button onClick={onClose}>返回</Button>
            <Button variant="danger" type="submit" disabled={pending}>
              {pending ? "停用中…" : "确认停用"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function AccountActions({
  account,
  onDisable,
}: {
  account: AccountView;
  onDisable: (account: AccountView, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link
        href={`/settings/accounts/${account.id}`}
        className="inline-flex min-h-11 items-center rounded-[7px] px-2.5 text-[13px] font-semibold text-[#344054] hover:bg-[#f2f4f7]"
      >
        编辑角色
      </Link>
      {account.enabled ? (
        <Button
          variant="ghost"
          className="min-h-11 px-2.5 text-[13px] text-[#c62828] hover:bg-[#fff0f0]"
          onClick={(event) => onDisable(account, event.currentTarget)}
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
  pagination,
}: {
  accounts: AccountView[];
  filters: {
    query: string;
    role: string;
    status: string;
    pageSize: number;
    active: boolean;
  };
  pagination: {
    page: number;
    total: number;
    totalPages: number;
    previousHref?: string;
    nextHref?: string;
  };
}) {
  const [disableTarget, setDisableTarget] = useState<AccountView>();
  const [successNotice, setSuccessNotice] = useState<{
    message: string;
    auditHref: string;
  }>();
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account-action-notice", {
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status !== 200) return;
        setSuccessNotice(
          (await response.json()) as { message: string; auditHref: string },
        );
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuccessNotice(undefined);
        }
      });
    return () => controller.abort();
  }, []);

  const openDisable = useCallback(
    (account: AccountView, trigger: HTMLButtonElement) => {
      dialogTrigger.current = trigger;
      setDisableTarget(account);
    },
    [],
  );

  const closeDisable = useCallback(() => {
    setDisableTarget(undefined);
    requestAnimationFrame(() => dialogTrigger.current?.focus());
  }, []);

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
        <Link
          href="/settings/accounts/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-[#2563eb] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
        >
          <IconPlus aria-hidden size={17} />
          新建账号
        </Link>
      </header>

      {successNotice ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]"
        >
          <span>{successNotice.message}</span>
          <Link
            href={successNotice.auditHref}
            className="inline-flex min-h-11 items-center text-[#065f46] underline underline-offset-4"
          >
            查看对应审计
          </Link>
        </div>
      ) : null}

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
          <select
            name="size"
            defaultValue={String(filters.pageSize)}
            aria-label="每页条数"
            className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] text-[#344054]"
          >
            <option value="20">每页 20 条</option>
            <option value="50">每页 50 条</option>
            <option value="100">每页 100 条</option>
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
              <h2 className="text-base font-semibold">
                {filters.active ? "当前筛选无结果" : "系统暂无账号"}
              </h2>
              <p className="mt-2 text-[13px] text-[#667085]">
                {filters.active
                  ? "请调整姓名、邮箱、角色或启用状态后重试。"
                  : "创建第一个本地账号并为其分配固定角色。"}
              </p>
              {filters.active ? (
                <Link
                  href="/settings/accounts"
                  className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]"
                >
                  清除筛选
                </Link>
              ) : (
                <Link
                  href="/settings/accounts/new"
                  className="mt-4 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white"
                >
                  新建账号
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]">
                  <tr>
                    {["姓名", "邮箱", "角色", "状态", "最近会话", "操作"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap"
                        >
                          {heading}
                        </th>
                      ),
                    )}
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
                        <AccountActions account={account} onDisable={openDisable} />
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
                  <AccountActions account={account} onDisable={openDisable} />
                </article>
              ))}
            </div>
          </>
        )}

        {pagination.total > 0 ? (
          <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]">
            <span>
              共 {pagination.total} 个账号 · 第 {pagination.page}/{pagination.totalPages} 页
            </span>
            <div className="flex gap-2">
              {pagination.previousHref ? (
                <Link
                  href={pagination.previousHref}
                  className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]"
                >
                  上一页
                </Link>
              ) : null}
              {pagination.nextHref ? (
                <Link
                  href={pagination.nextHref}
                  className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]"
                >
                  下一页
                </Link>
              ) : null}
            </div>
          </footer>
        ) : null}
      </section>

      {disableTarget ? (
        <DisableAccountDialog account={disableTarget} onClose={closeDisable} />
      ) : null}
    </>
  );
}
