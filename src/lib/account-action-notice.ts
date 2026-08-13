import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnvironment } from "@/lib/env";

export type AccountActionNoticePayload = {
  actorId: string;
  auditId: string;
  expiresAt: number;
};

function signature(payload: string): string {
  return createHmac("sha256", getServerEnvironment().BETTER_AUTH_SECRET)
    .update(payload)
    .digest("base64url");
}

export function createAccountActionNotice(
  actorId: string,
  auditId: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({ actorId, auditId, expiresAt: Date.now() + 60_000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readAccountActionNotice(
  token: string,
): AccountActionNoticePayload | null {
  const [payload, receivedSignature] = token.split(".");
  if (!payload || !receivedSignature) return null;

  const expectedSignature = signature(payload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(receivedSignature);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return null;
  }

  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AccountActionNoticePayload;
    return value.expiresAt > Date.now() ? value : null;
  } catch {
    return null;
  }
}
