"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

export function OverviewRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      aria-label="刷新经营总览数据"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <IconRefresh
        aria-hidden
        size={17}
        className={isPending ? "animate-spin" : undefined}
      />
      {isPending ? "正在刷新" : "刷新数据"}
    </Button>
  );
}
