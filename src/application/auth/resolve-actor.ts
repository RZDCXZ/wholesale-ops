import type { Role } from "../../domain/role";

export type { Role } from "../../domain/role";

export type SessionIdentity = {
  userId: string;
};

export type StoredIdentity = {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  roles: Role[];
};

export type Actor = Omit<StoredIdentity, "enabled">;

type AuthenticationPorts = {
  readSession: () => Promise<SessionIdentity | null>;
  findIdentity: (userId: string) => Promise<StoredIdentity | null>;
};

export type AuthenticationResult =
  | {
      kind: "authenticated";
      actor: Actor;
    }
  | {
      kind: "unauthenticated";
      reason: "missing-session" | "invalid-session" | "inactive-account";
    };

export async function resolveActor(
  ports: AuthenticationPorts,
): Promise<AuthenticationResult> {
  const session = await ports.readSession();

  if (!session) {
    return { kind: "unauthenticated", reason: "missing-session" };
  }

  const identity = await ports.findIdentity(session.userId);

  if (!identity) {
    return { kind: "unauthenticated", reason: "invalid-session" };
  }

  if (!identity.enabled) {
    return { kind: "unauthenticated", reason: "inactive-account" };
  }

  return {
    kind: "authenticated",
    actor: {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      roles: identity.roles,
    },
  };
}

export type AuthorizationResult =
  | { kind: "authorized"; actor: Actor }
  | { kind: "forbidden"; requiredRole: Role };

export function authorizeActor(
  actor: Actor,
  requiredRole: Role,
): AuthorizationResult {
  if (!actor.roles.includes(requiredRole)) {
    return { kind: "forbidden", requiredRole };
  }

  return { kind: "authorized", actor };
}
