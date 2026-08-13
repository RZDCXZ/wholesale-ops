"use client";

import { Button } from "@/components/ui/button";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-lg border border-[#e4e7ec] bg-white p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-bold">暂时无法加载数据</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">
          当前页面上下文已保留，请稍后重试；如果问题持续，请返回工作区后再进入。
        </p>
        <Button variant="primary" className="mt-5" onClick={reset}>
          重新加载
        </Button>
      </div>
    </section>
  );
}
