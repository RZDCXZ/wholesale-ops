"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { keepFocusInDialog } from "@/lib/dialog-focus";

export type AuditDetailView = {
  id: string;
  title: string;
  occurredAt: string;
  actorName: string;
  action: string;
  objectType: string;
  referenceCode: string;
  reason: string;
  summary: string;
  accountHref?: string;
};

export function AuditDetailDrawer({
  audit,
  closeHref,
  returnFocusId,
}: {
  audit: AuditDetailView;
  closeHref: string;
  returnFocusId: string;
}) {
  const router = useRouter();
  const closeButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButton.current?.focus();
    return () => {
      requestAnimationFrame(() => {
        const triggers = document.querySelectorAll<HTMLElement>(
          `[data-audit-trigger="${CSS.escape(returnFocusId)}"]`,
        );
        Array.from(triggers)
          .find((trigger) => trigger.offsetParent !== null)
          ?.focus();
      });
    };
  }, [returnFocusId]);

  function close() {
    router.replace(closeHref);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35">
      <button
        type="button"
        tabIndex={-1}
        aria-label="关闭审计详情"
        className="absolute inset-0"
        onClick={close}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
        onKeyDown={(event) => keepFocusInDialog(event, close)}
        className="relative z-10 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#e4e7ec] pb-4">
          <div>
            <p className="text-xs font-semibold text-[#667085]">业务审计详情</p>
            <h2 id="audit-detail-title" className="mt-1 text-xl font-bold">
              {audit.title}
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="inline-flex min-h-11 items-center rounded-[7px] px-3 text-sm font-semibold text-[#475467] hover:bg-[#f2f4f7]"
            onClick={close}
          >
            关闭
          </button>
        </header>
        <dl className="grid gap-5 py-5 text-sm">
          {[
            ["发生时间", audit.occurredAt],
            ["操作者", audit.actorName],
            ["动作", audit.action],
            ["对象类型", audit.objectType],
            ["关联编号", audit.referenceCode],
            ["原因", audit.reason],
            ["变更摘要", audit.summary],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-[#667085]">{label}</dt>
              <dd className="mt-1.5 break-words leading-6 text-[#1d2939]">{value}</dd>
            </div>
          ))}
        </dl>
        {audit.accountHref ? (
          <Link
            href={audit.accountHref}
            className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]"
          >
            查看关联账号
          </Link>
        ) : null}
      </aside>
    </div>
  );
}
