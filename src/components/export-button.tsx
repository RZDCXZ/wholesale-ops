"use client";

import { IconDownload } from "@tabler/icons-react";
import { useState } from "react";

type ExportFeedback =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function downloadFileName(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encoded) return fallback;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return fallback;
  }
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    // 非 JSON 的服务异常使用统一业务反馈。
  }
  return "导出失败，请稍后重试。";
}

export function ExportButton({
  href,
  entityLabel,
  disabled = false,
  disabledMessage,
}: {
  href: string;
  entityLabel: string;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<ExportFeedback>(() =>
    disabled && disabledMessage
      ? { kind: "error", message: disabledMessage }
      : { kind: "idle" },
  );

  async function exportCurrentFilters() {
    setDownloading(true);
    setFeedback({ kind: "idle" });
    try {
      const response = await fetch(href, {
        credentials: "same-origin",
        headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message: await responseErrorMessage(response),
        });
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadFileName(response, `${entityLabel}.xlsx`);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);

      const rowCount = response.headers.get("x-export-row-count");
      setFeedback({
        kind: "success",
        message: rowCount
          ? `已导出 ${rowCount} 条${entityLabel}。`
          : `${entityLabel}已导出。`,
      });
    } catch {
      setFeedback({ kind: "error", message: "导出失败，请稍后重试。" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="grid justify-items-end gap-1.5 max-md:justify-items-stretch">
      <button
        type="button"
        disabled={disabled || downloading}
        onClick={exportCurrentFilters}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:bg-[#f2f4f7] disabled:text-[#98a2b3]"
      >
        <IconDownload aria-hidden size={17} />
        {downloading ? "正在导出…" : "导出当前筛选"}
      </button>
      {feedback.kind !== "idle" ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`max-w-72 text-right text-xs max-md:text-left ${feedback.kind === "error" ? "text-[#c62828]" : "text-[#027a48]"}`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
