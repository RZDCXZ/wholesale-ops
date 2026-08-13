"use client";

import {
  IconAlertCircle,
  IconCircleCheck,
  IconDownload,
  IconFileSpreadsheet,
  IconLoader2,
  IconUpload,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";

type ImportKind = "sku" | "customer";

type SkuPreviewRow = {
  rowNumber: number;
  skuCode: string;
  name: string;
  category: string;
  inventoryUnit: string;
  referencePriceFen: number;
  warningThreshold: number;
  enabled: boolean;
};

type CustomerPreviewRow = {
  rowNumber: number;
  customerCode: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  responsibleSalesId: string;
  responsibleSalesName: string;
  responsibleSalesEmail: string;
  paymentTermDays: number;
  enabled: boolean;
};

type PreviewRow = SkuPreviewRow | CustomerPreviewRow;

type PreviewError = {
  rowNumber: number;
  field: string;
  value: string;
  reason: string;
};

type RejectedPreview = {
  status: "rejected";
  code: string;
  message: string;
};

type InvalidPreview = {
  status: "invalid";
  fileName: string;
  totalRows: number;
  validRows: PreviewRow[];
  errors: PreviewError[];
};

type ReadyPreview = {
  status: "ready";
  fileName: string;
  totalRows: number;
  validRows: PreviewRow[];
  errors: [];
  previewToken: string;
  expiresAt: string;
};

type Preview = RejectedPreview | InvalidPreview | ReadyPreview;
type FileDetails = { name: string; size: number };
type SuccessResult = { importId: string; auditId: string; importedCount: number };
type Phase =
  | "idle"
  | "uploading"
  | "preview"
  | "confirming"
  | "confirm-error"
  | "success"
  | "duplicate"
  | "request-error";

const importConfigs = {
  sku: {
    label: "SKU",
    note: "建立商品资料",
    apiSegment: "sku",
    templateHref: "/api/imports/sku/template",
    inputLabel: "选择 SKU Excel 文件",
    templateLabel: "下载 SKU 模板",
    listHref: "/skus",
    listLabel: "查看 SKU",
  },
  customer: {
    label: "客户",
    note: "建立客户资料",
    apiSegment: "customer",
    templateHref: "/api/imports/customer/template",
    inputLabel: "选择客户 Excel 文件",
    templateLabel: "下载客户模板",
    listHref: "/customers",
    listLabel: "查看客户",
  },
} as const;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatMoney(fen: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(fen / 100);
}

function formatPaymentTerm(days: number): string {
  return days === 0 ? "现结" : `${days} 天`;
}

export function ImportWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>("sku");
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<FileDetails>();
  const [preview, setPreview] = useState<Preview>();
  const [success, setSuccess] = useState<SuccessResult>();
  const [requestError, setRequestError] = useState<string>();
  const config = importConfigs[kind];

  function reset() {
    setPhase("idle");
    setFile(undefined);
    setPreview(undefined);
    setSuccess(undefined);
    setRequestError(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectKind(nextKind: ImportKind) {
    reset();
    setKind(nextKind);
  }

  async function upload(selectedFile: File) {
    setFile({ name: selectedFile.name, size: selectedFile.size });
    setPreview(undefined);
    setSuccess(undefined);
    setRequestError(undefined);
    setPhase("uploading");

    const formData = new FormData();
    formData.set("file", selectedFile);
    try {
      const response = await fetch(`/api/imports/${config.apiSegment}/preview`, {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as Preview | { message?: string };
      if (!response.ok) {
        setRequestError(
          "message" in body && body.message
            ? body.message
            : "上传失败，请重试。",
        );
        setPhase("request-error");
        return;
      }
      setPreview(body as Preview);
      setPhase("preview");
    } catch {
      setRequestError("无法连接到服务，请稍后重试。");
      setPhase("request-error");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const selectedFile = event.dataTransfer.files[0];
    if (selectedFile) void upload(selectedFile);
  }

  async function confirmImport() {
    if (preview?.status !== "ready") return;
    setRequestError(undefined);
    setPhase("confirming");
    try {
      const response = await fetch(`/api/imports/${config.apiSegment}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewToken: preview.previewToken }),
      });
      const body = (await response.json()) as SuccessResult & {
        code?: string;
        message?: string;
      };
      if (!response.ok) {
        setRequestError(body.message ?? "确认导入失败，请重新上传校验。");
        const previewMustBeRecreated = [
          "FORBIDDEN",
          "PREVIEW_FORBIDDEN",
          "PREVIEW_INVALID",
          "PREVIEW_STALE",
        ].includes(body.code ?? "");
        setPhase(
          body.code === "DUPLICATE_SUBMISSION"
            ? "duplicate"
            : previewMustBeRecreated
              ? "request-error"
              : "confirm-error",
        );
        return;
      }
      setSuccess(body);
      setPhase("success");
    } catch {
      setRequestError("无法连接到服务，请稍后重试。");
      setPhase("confirm-error");
    }
  }

  const errorRowCount =
    preview?.status === "invalid"
      ? new Set(preview.errors.map(({ rowNumber }) => rowNumber)).size
      : 0;
  const entityWithCount = (count: number) => `${count} 个${kind === "sku" ? " SKU" : "客户"}`;

  return (
    <div className="grid gap-4">
      <ol aria-label="导入步骤" className="grid grid-cols-3 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white text-center text-[13px] font-semibold text-[#667085]">
        {["1 选择类型", "2 上传并校验", "3 确认写入"].map((label, index) => {
          const active =
            index === 0 ||
            (phase !== "idle" && index === 1) ||
            (["confirming", "success", "duplicate"].includes(phase) && index === 2);
          return <li key={label} className={active ? "border-r border-[#e4e7ec] bg-[#eff6ff] px-2 py-3 text-[#1d4ed8] last:border-r-0" : "border-r border-[#e4e7ec] px-2 py-3 last:border-r-0"}>{label}</li>;
        })}
      </ol>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <div className="grid gap-3 border-b border-[#e4e7ec] p-4 md:grid-cols-3">
          {(Object.keys(importConfigs) as ImportKind[]).map((candidateKind) => {
            const candidate = importConfigs[candidateKind];
            const selected = candidateKind === kind;
            return (
              <button
                key={candidateKind}
                type="button"
                aria-pressed={selected}
                disabled={phase !== "idle"}
                onClick={() => selectKind(candidateKind)}
                className={selected ? "flex min-h-24 items-start gap-3 rounded-lg border-2 border-[#2563eb] bg-[#eff6ff] p-4 text-left" : "flex min-h-24 items-start gap-3 rounded-lg border border-[#d0d5dd] bg-white p-4 text-left hover:bg-[#f9fafb]"}
              >
                <IconFileSpreadsheet aria-hidden className={selected ? "mt-0.5 shrink-0 text-[#2563eb]" : "mt-0.5 shrink-0 text-[#667085]"} size={24} />
                <span><strong className="block text-sm">{candidate.label}</strong><span className="mt-1 block text-xs text-[#667085]">{candidate.note}</span></span>
              </button>
            );
          })}
          <button type="button" disabled className="flex min-h-24 items-start gap-3 rounded-lg border border-[#d0d5dd] bg-[#f8fafc] p-4 text-left text-[#98a2b3]">
            <IconFileSpreadsheet aria-hidden className="mt-0.5 shrink-0" size={24} />
            <span><strong className="block text-sm text-[#667085]">期初库存</strong><span className="mt-1 block text-xs">工单 07 实现</span></span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 border-b border-[#e4e7ec] bg-[#fafbfc] p-4 max-sm:items-start">
          <div><strong className="text-sm">先使用标准模板</strong><p className="mt-1 text-xs text-[#667085]">最大 10 MB，每次最多 2,000 行；不接受宏和公式</p></div>
          <a href={config.templateHref} download className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]"><IconDownload aria-hidden size={17} />{config.templateLabel}</a>
        </div>

        <div className="p-4">
          {phase === "idle" ? (
            <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="grid min-h-52 place-items-center rounded-lg border-2 border-dashed border-[#b8c0cc] bg-[#fafbfc] p-6 text-center">
              <div><IconUpload aria-hidden className="mx-auto text-[#2563eb]" size={31} /><strong className="mt-3 block text-sm">拖放或选择 .xlsx 文件</strong><p className="mt-1.5 text-xs text-[#667085]">文件只在服务端内存中解析，不保存原始上传文件</p><Button className="mt-4" onClick={() => inputRef.current?.click()}>选择文件</Button><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label={config.inputLabel} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void upload(selected); }} /></div>
            </div>
          ) : null}

          {phase === "uploading" ? (
            <div role="status" className="grid min-h-52 place-items-center rounded-lg border border-[#d0d5dd] bg-[#fafbfc] p-6 text-center"><div><IconLoader2 aria-hidden className="mx-auto animate-spin text-[#2563eb]" size={30} /><strong className="mt-3 block text-sm">正在上传并逐行校验</strong><p className="mt-1 text-xs text-[#667085]">{file?.name}</p></div></div>
          ) : null}

          {file && phase !== "idle" && phase !== "uploading" ? (
            <dl className="mb-4 grid gap-3 rounded-lg border border-[#e4e7ec] bg-[#f8fafc] p-3 text-[13px] sm:grid-cols-3"><div><dt className="text-xs text-[#667085]">文件名</dt><dd className="mt-1 break-all font-semibold">{file.name}</dd></div><div><dt className="text-xs text-[#667085]">大小</dt><dd className="mt-1 font-semibold">{formatSize(file.size)}</dd></div><div><dt className="text-xs text-[#667085]">解析状态</dt><dd className="mt-1 font-semibold">{preview?.status === "ready" ? "全部通过" : preview?.status === "invalid" ? "发现错误" : "解析失败"}</dd></div></dl>
          ) : null}

          {phase === "preview" && preview?.status === "rejected" ? (
            <Notice tone="danger" title="文件未通过解析" message={preview.message} action={<Button onClick={reset}>重新选择文件</Button>} />
          ) : null}

          {phase === "preview" && preview?.status === "invalid" ? (
            <div className="grid gap-4"><Notice tone="danger" title={`发现 ${preview.errors.length} 条错误（${errorRowCount} 行），整批不会写入`} message={`请修正源文件后重新上传；当前 ${preview.validRows.length} 条正确记录不会单独写入。`} action={<Button onClick={reset}>重新选择文件</Button>} /><ValidRowsTable kind={kind} rows={preview.validRows} /><ErrorRowsTable errors={preview.errors} /></div>
          ) : null}

          {(["preview", "confirming", "confirm-error"] as Phase[]).includes(phase) && preview?.status === "ready" ? (
            <div className="grid gap-4">{phase === "confirm-error" ? <Notice tone="danger" title="确认失败，可以直接重试" message={requestError ?? "服务暂时不可用，请重试。"} /> : <Notice tone="success" title={`${preview.totalRows} 行数据全部通过校验`} message={kind === "sku" ? "确认时会重新校验当前操作者和 SKU 编码；所有 SKU 与业务审计在单一事务中写入。" : "确认时会重新校验当前操作者、客户编码和客户负责人；所有客户与业务审计在单一事务中写入。"} />}<ValidRowsTable kind={kind} rows={preview.validRows} /><div className="flex justify-end gap-2 border-t border-[#e4e7ec] pt-4"><Button onClick={reset} disabled={phase === "confirming"}>重新上传</Button><Button variant="primary" onClick={confirmImport} disabled={phase === "confirming"}>{phase === "confirming" ? <><IconLoader2 aria-hidden className="animate-spin" size={17} />正在确认</> : phase === "confirm-error" ? "重试确认" : `确认导入 ${entityWithCount(preview.totalRows)}`}</Button></div></div>
          ) : null}

          {phase === "success" && success ? (
            <div className="grid min-h-64 place-items-center rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] p-6 text-center"><div><IconCircleCheck aria-hidden className="mx-auto text-[#027a48]" size={38} /><h2 className="mt-3 text-lg font-bold">成功导入 {entityWithCount(success.importedCount)}</h2><p className="mt-2 text-[13px] text-[#475467]">{config.label}资料和一条业务审计已在同一事务中写入。</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Link href={config.listHref} className="inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white">{config.listLabel}</Link><Link href={`/audit?detail=${success.auditId}`} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054]">查看业务审计</Link><Button onClick={reset}>继续导入</Button></div></div></div>
          ) : null}

          {phase === "duplicate" ? <Notice tone="danger" title="不能重复提交" message={requestError ?? "该预览已经导入，不能重复提交。"} action={<Button onClick={reset}>开始新的导入</Button>} /> : null}
          {phase === "request-error" ? <Notice tone="danger" title="操作未完成" message={requestError ?? "请重新上传文件后重试。"} action={<Button onClick={reset}>重新开始</Button>} /> : null}
        </div>
      </section>
    </div>
  );
}

function Notice({ tone, title, message, action }: { tone: "success" | "danger"; title: string; message: string; action?: React.ReactNode }) {
  const success = tone === "success";
  const Icon = success ? IconCircleCheck : IconAlertCircle;
  return <div role={success ? "status" : "alert"} className={success ? "flex items-start gap-3 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] p-4 text-[#027a48]" : "flex items-start gap-3 rounded-lg border border-[#edb1b1] bg-[#fff0f0] p-4 text-[#c62828]"}><Icon aria-hidden className="mt-0.5 shrink-0" size={19} /><div className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><p className="mt-1 text-[13px] text-[#475467]">{message}</p></div>{action ? <div className="shrink-0">{action}</div> : null}</div>;
}

function ValidRowsTable({ kind, rows }: { kind: ImportKind; rows: PreviewRow[] }) {
  if (rows.length === 0) return null;
  return <section><div className="mb-2 flex items-end justify-between gap-3"><div><h2 className="text-sm font-bold">可导入行</h2><p className="mt-1 text-xs text-[#667085]">共 {rows.length} 行</p></div></div>{kind === "sku" ? <SkuRowsTable rows={rows as SkuPreviewRow[]} /> : <CustomerRowsTable rows={rows as CustomerPreviewRow[]} />}</section>;
}

function SkuRowsTable({ rows }: { rows: SkuPreviewRow[] }) {
  return <div className="overflow-x-auto rounded-lg border border-[#e4e7ec]"><table className="w-full min-w-[980px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr>{["行号", "SKU 编码", "名称", "分类", "库存单位", "参考售价", "预警值", "启用状态"].map((heading) => <th key={heading} className="border-b border-[#e4e7ec] px-3 py-2.5 font-semibold whitespace-nowrap">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber} style={{ contentVisibility: "auto", containIntrinsicSize: "0 48px" }} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-3 py-2.5 tabular-nums">{row.rowNumber}</td><td className="px-3 py-2.5 font-mono text-xs font-semibold text-[#1d4ed8]">{row.skuCode}</td><td className="max-w-72 px-3 py-2.5 font-semibold">{row.name}</td><td className="px-3 py-2.5">{row.category}</td><td className="px-3 py-2.5">{row.inventoryUnit}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.referencePriceFen)}</td><td className="px-3 py-2.5 text-right tabular-nums">{row.warningThreshold}</td><td className="px-3 py-2.5">{row.enabled ? "启用" : "停用"}</td></tr>)}</tbody></table></div>;
}

function CustomerRowsTable({ rows }: { rows: CustomerPreviewRow[] }) {
  return <div className="overflow-x-auto rounded-lg border border-[#e4e7ec]"><table className="w-full min-w-[1280px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr>{["行号", "客户编码", "名称", "联系人", "电话", "地址", "客户负责人", "默认账期", "启用状态"].map((heading) => <th key={heading} className="border-b border-[#e4e7ec] px-3 py-2.5 font-semibold whitespace-nowrap">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber} style={{ contentVisibility: "auto", containIntrinsicSize: "0 48px" }} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-3 py-2.5 tabular-nums">{row.rowNumber}</td><td className="px-3 py-2.5 font-mono text-xs font-semibold text-[#1d4ed8]">{row.customerCode}</td><td className="max-w-64 px-3 py-2.5 font-semibold">{row.name}</td><td className="px-3 py-2.5">{row.contactName}</td><td className="px-3 py-2.5 whitespace-nowrap">{row.phone}</td><td className="max-w-80 px-3 py-2.5">{row.address}</td><td className="px-3 py-2.5"><strong className="block font-semibold">{row.responsibleSalesName}</strong><span className="text-xs text-[#667085]">{row.responsibleSalesEmail}</span></td><td className="px-3 py-2.5 whitespace-nowrap">{formatPaymentTerm(row.paymentTermDays)}</td><td className="px-3 py-2.5">{row.enabled ? "启用" : "停用"}</td></tr>)}</tbody></table></div>;
}

function ErrorRowsTable({ errors }: { errors: PreviewError[] }) {
  return <section><div className="mb-2"><h2 className="text-sm font-bold">错误行</h2><p className="mt-1 text-xs text-[#667085]">逐项修正后请重新上传完整文件</p></div><div className="overflow-x-auto rounded-lg border border-[#edb1b1]"><table className="w-full min-w-[760px] border-collapse text-left text-[13px]"><thead className="bg-[#fff7f7] text-[#7a271a]"><tr>{["行号", "字段", "原值", "结果", "错误原因"].map((heading) => <th key={heading} className="border-b border-[#edb1b1] px-3 py-2.5 font-semibold whitespace-nowrap">{heading}</th>)}</tr></thead><tbody>{errors.map((error, index) => <tr key={`${error.rowNumber}-${error.field}-${index}`} style={{ contentVisibility: "auto", containIntrinsicSize: "0 48px" }} className="border-b border-[#f5d6d6] last:border-b-0"><td className="px-3 py-2.5 tabular-nums">{error.rowNumber}</td><td className="px-3 py-2.5 font-semibold">{error.field}</td><td className="max-w-64 px-3 py-2.5 break-all text-[#667085]">{error.value || "（空）"}</td><td className="px-3 py-2.5 font-semibold text-[#c62828]">错误</td><td className="px-3 py-2.5 text-[#7a271a]">{error.reason}</td></tr>)}</tbody></table></div></section>;
}
