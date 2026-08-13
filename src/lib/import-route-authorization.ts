import "server-only";

import { authorizeCapability } from "@/application/auth/access-policy";
import type { Actor } from "@/application/auth/resolve-actor";
import { getCurrentActor } from "@/lib/current-actor";

export async function getImportRouteActor(): Promise<Actor | Response> {
  const authentication = await getCurrentActor();
  if (authentication.kind !== "authenticated") {
    return Response.json(
      { code: "UNAUTHENTICATED", message: "请先登录。" },
      { status: 401 },
    );
  }
  if (
    authorizeCapability(authentication.actor, "IMPORTS_MANAGE").kind !==
    "authorized"
  ) {
    return Response.json(
      { code: "FORBIDDEN", message: "只有老板可以使用导入工作台。" },
      { status: 403 },
    );
  }
  return authentication.actor;
}
