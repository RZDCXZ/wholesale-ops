"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export function SkuTableRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      onClick={(event: MouseEvent<HTMLTableRowElement>) => {
        if ((event.target as HTMLElement).closest("a, button, input, select")) return;
        router.push(href);
      }}
      className="cursor-pointer border-b border-[#eef0f3] last:border-b-0 hover:bg-[#fafbfc]"
    >
      {children}
    </tr>
  );
}
