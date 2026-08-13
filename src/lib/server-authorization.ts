import "server-only";

import { redirect } from "next/navigation";

import {
  authorizeCapability,
  type Capability,
} from "@/application/auth/access-policy";
import type { Actor } from "@/application/auth/resolve-actor";
import { getCurrentActor } from "@/lib/current-actor";

export async function getPageActor(capability: Capability): Promise<Actor> {
  const authentication = await getCurrentActor();

  if (authentication.kind !== "authenticated") {
    redirect("/login");
  }

  if (
    authorizeCapability(authentication.actor, capability).kind !== "authorized"
  ) {
    redirect("/forbidden");
  }

  return authentication.actor;
}

export async function getActionActor(): Promise<Actor> {
  const authentication = await getCurrentActor();

  if (authentication.kind !== "authenticated") {
    throw new Error("UNAUTHENTICATED");
  }

  return authentication.actor;
}
