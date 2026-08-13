import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { getCurrentActor } from "@/lib/current-actor";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const authentication = await getCurrentActor();

  if (authentication.kind !== "authenticated") {
    redirect("/login");
  }

  const { name, email, roles } = authentication.actor;
  return <AppShell actor={{ name, email, roles }}>{children}</AppShell>;
}
