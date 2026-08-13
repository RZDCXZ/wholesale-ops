import Link from "next/link";

export default function CustomerNotFound() {
  return <div className="grid min-h-[55vh] place-items-center text-center"><div><h1 className="text-2xl font-bold">客户不存在或不可访问</h1><p className="mt-2 text-sm text-[#667085]">该客户可能已删除，或不在你的负责人数据范围内。</p><Link href="/customers" className="mt-5 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white">返回客户列表</Link></div></div>;
}
