import Link from "next/link";

export default function AccountNotFound() {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-lg border border-[#e4e7ec] bg-white p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-bold">账号记录不可用</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">
          该记录可能不存在，或当前账号已不能访问它。
        </p>
        <Link
          href="/settings/accounts"
          className="mt-5 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white"
        >
          返回账号列表
        </Link>
      </div>
    </section>
  );
}
