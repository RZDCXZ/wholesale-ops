import { IconChartBar } from "@tabler/icons-react";
import type { Metadata } from "next";

import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = {
  title: "经营总览",
};

export default async function OverviewPage() {
  await getPageActor("OVERVIEW_VIEW");

  return (
    <>
      <header className="mb-[18px] min-h-[58px]">
        <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
          经营总览
        </h1>
      </header>

      <section className="grid min-h-[360px] place-items-center rounded-lg border border-[#e4e7ec] bg-white p-5 text-center">
        <div className="grid justify-items-center">
          <span className="grid size-12 place-items-center rounded-full bg-[#f2f4f7] text-[#667085]">
            <IconChartBar aria-hidden size={24} />
          </span>
          <h2 className="mt-4 text-base font-semibold">系统暂无数据</h2>
          <p className="mt-2 max-w-[420px] text-[13px] leading-6 text-[#667085]">
            业务记录将在这里集中展示并保持可追溯。
          </p>
        </div>
      </section>
    </>
  );
}
