import Link from "next/link";

export default function SalesOrderNotFound() {
  return <div className="grid min-h-[55vh] place-items-center text-center"><div><h1 className="text-2xl font-bold">销售单草稿不存在或不可编辑</h1><p className="mt-2 text-sm text-[#667085]">该销售单可能已删除、已不再是草稿，或不在你的创建者与负责人数据范围内。</p><Link href="/sales-orders" className="mt-5 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white">返回销售单列表</Link></div></div>;
}
