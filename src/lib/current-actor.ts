import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import {
  authorizeActor,
  resolveActor,
  type Actor,
  type AuthenticationResult,
  type Role,
} from "@/application/auth/resolve-actor";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

export const getCurrentActor = cache(async (): Promise<AuthenticationResult> => {
  const result = await resolveActor({
    async readSession() {
      const session = await auth.api.getSession({ headers: await headers() });
      return session ? { userId: session.user.id } : null;
    },
    async findIdentity(userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          enabled: true,
          roles: { select: { role: true } },
        },
      });

      return user
        ? {
            ...user,
            roles: user.roles.map(({ role }) => role as Role),
          }
        : null;
    },
  });

  if (result.kind === "unauthenticated") {
    logger.info({ event: "auth.boundary.denied", reason: result.reason });
  }

  return result;
});

export async function getAuthorizedActor(
  requiredRole: Role,
): Promise<Actor | null> {
  const authentication = await getCurrentActor();

  if (authentication.kind !== "authenticated") {
    return null;
  }

  const authorization = authorizeActor(authentication.actor, requiredRole);
  return authorization.kind === "authorized" ? authorization.actor : null;
}
