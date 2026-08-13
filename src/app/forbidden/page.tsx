import { IconLock } from "@tabler/icons-react";
import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f6f7f9] p-6 text-center">
      <section className="grid max-w-md justify-items-center rounded-lg border border-[#e4e7ec] bg-white p-8">
        <span className="grid size-12 place-items-center rounded-full bg-[#fff0f0] text-[#c62828]">
          <IconLock aria-hidden size={24} />
        </span>
        <h1 className="mt-4 text-xl font-bold">没有访问权限</h1>
        <p className="mt-2 text-sm leading-6 text-[#667085]">
          当前账号没有进入老板工作区所需的角色。
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white"
        >
          返回登录页
        </Link>
      </section>
    </main>
  );
}
