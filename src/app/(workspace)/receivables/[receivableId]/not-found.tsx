import Link from "next/link";

export default function ReceivableNotFound() {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-lg border border-[#e4e7ec] bg-white p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-bold">应收不存在或不可访问</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">记录可能不存在，或当前账号不负责对应客户。为保护经营数据，页面不会透露更多信息。</p>
        <Link href="/sales-orders" className="mt-5 inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">返回可访问页面</Link>
      </div>
    </section>
  );
}
