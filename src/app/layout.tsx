import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "批发经营台账 · Wholesale Ops",
    template: "%s · 批发经营台账",
  },
  description: "使用虚构数据的本地五金耗材批发经营演示台账。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
