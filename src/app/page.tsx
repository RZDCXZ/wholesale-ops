import { redirect } from "next/navigation";

import { getCurrentActor } from "@/lib/current-actor";

export default async function HomePage() {
  const authentication = await getCurrentActor();
  redirect(authentication.kind === "authenticated" ? "/overview" : "/login");
}
