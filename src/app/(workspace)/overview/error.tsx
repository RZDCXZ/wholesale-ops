"use client";

import { Button } from "@/components/ui/button";

export default function OverviewError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-lg border border-[#e4e7ec] bg-white p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-bold">暂时无法加载经营总览</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">
          销售、收款、应收或库存数据读取失败，请稍后重试。
        </p>
        <Button variant="primary" className="mt-5" onClick={retry}>
          重新加载
        </Button>
      </div>
    </section>
  );
}
