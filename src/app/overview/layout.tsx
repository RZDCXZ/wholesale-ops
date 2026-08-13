import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { authorizeActor } from "@/application/auth/resolve-actor";
import { AppShell } from "@/components/app-shell";
import { getCurrentActor } from "@/lib/current-actor";

export default async function OverviewLayout({ children }: { children: ReactNode }) {
  const authentication = await getCurrentActor();

  if (authentication.kind !== "authenticated") {
    redirect("/login");
  }

  const authorization = authorizeActor(authentication.actor, "OWNER");

  if (authorization.kind !== "authorized") {
    redirect("/forbidden");
  }

  return <AppShell actor={authorization.actor}>{children}</AppShell>;
}
