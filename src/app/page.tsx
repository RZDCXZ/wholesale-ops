import { redirect } from "next/navigation";

import { getActorHomePath } from "@/application/auth/access-policy";
import { getCurrentActor } from "@/lib/current-actor";

export default async function HomePage() {
  const authentication = await getCurrentActor();
  redirect(
    authentication.kind === "authenticated"
      ? getActorHomePath(authentication.actor)
      : "/login",
  );
}
