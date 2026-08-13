import { IconFileInvoice } from "@tabler/icons-react";
import type { Metadata } from "next";

import { WorkspaceEmptyState } from "@/components/workspace-empty-state";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "销售单" };

export default async function SalesOrdersPage() {
  await getPageActor("SALES_ORDERS_VIEW");

  return (
    <WorkspaceEmptyState
      title="销售单"
      description="后续销售单将在这里按当前账号的数据范围展示。"
      icon={<IconFileInvoice aria-hidden size={24} />}
    />
  );
}
