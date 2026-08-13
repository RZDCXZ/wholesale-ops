import { IconPackageExport } from "@tabler/icons-react";
import type { Metadata } from "next";

import { WorkspaceEmptyState } from "@/components/workspace-empty-state";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "待出库" };

export default async function OutboundPage() {
  await getPageActor("OUTBOUND_VIEW");

  return (
    <WorkspaceEmptyState
      title="待出库工作台"
      description="已确认销售单将在这里仅展示完整出库所需信息。"
      icon={<IconPackageExport aria-hidden size={24} />}
    />
  );
}
