import { IconReceipt2 } from "@tabler/icons-react";
import type { Metadata } from "next";

import { WorkspaceEmptyState } from "@/components/workspace-empty-state";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "应收" };

export default async function ReceivablesPage() {
  await getPageActor("RECEIVABLES_VIEW");

  return (
    <WorkspaceEmptyState
      title="应收"
      description="出库后生成的经营应收将在这里集中展示。"
      icon={<IconReceipt2 aria-hidden size={24} />}
    />
  );
}
