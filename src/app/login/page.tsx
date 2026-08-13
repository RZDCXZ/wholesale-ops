import { IconShoppingCart } from "@tabler/icons-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentActor } from "@/lib/current-actor";

export const metadata: Metadata = {
  title: "登录",
};

export default async function LoginPage() {
  const authentication = await getCurrentActor();

  if (authentication.kind === "authenticated") {
    redirect("/");
  }

  return (
    <main className="grid min-h-svh bg-white md:grid-cols-[1.05fr_0.95fr]">
      <section className="flex min-h-[250px] flex-col border-b border-[#e4e7ec] bg-[#f4f7fb] px-6 py-8 md:min-h-svh md:border-r md:border-b-0 md:px-[clamp(40px,7vw,110px)] md:py-[54px]">
        <div className="grid size-12 place-items-center rounded-[10px] bg-[#2563eb] text-white">
          <IconShoppingCart aria-hidden size={28} />
        </div>
        <h1 className="mt-[18px] text-[27px] leading-tight font-bold tracking-[-0.02em]">
          批发经营台账
        </h1>
        <p className="mt-1 text-sm text-[#667085]">Wholesale Ops</p>

        <div className="my-9 max-w-[520px] md:my-auto">
          <h2 className="text-[25px] leading-[1.25] font-bold tracking-[-0.03em] md:text-[clamp(28px,3vw,42px)]">
            把销售、库存与应收连成一条可信记录
          </h2>
          <p className="mt-3.5 text-[15px] leading-7 text-[#667085]">
            用于中国大陆五金耗材批发业务的本地经营演示台账。
          </p>
        </div>

        <small className="text-xs text-[#667085]">
          本地演示环境 · 数据均为虚构 · 不是财税系统
        </small>
      </section>

      <section className="grid place-items-center px-6 py-8 md:p-9">
        <LoginForm />
      </section>
    </main>
  );
}
