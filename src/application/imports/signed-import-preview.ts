import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { ZodType } from "zod";

export type ImportTokenContext = {
  secret: string;
  now: Date;
};

type ImportPreviewPayload = {
  version: number;
  previewId: string;
  actorId: string;
  importType: string;
  fileName: string;
  expiresAt: number;
  rows: unknown[];
};

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueImportPreviewToken<Payload extends ImportPreviewPayload>(
  payload: Omit<Payload, "previewId" | "expiresAt">,
  context: ImportTokenContext,
): { previewToken: string; expiresAt: Date } {
  const expiresAt = new Date(context.now.getTime() + 15 * 60_000);
  const completedPayload = {
    ...payload,
    previewId: randomUUID(),
    expiresAt: expiresAt.getTime(),
  } as Payload;
  const encodedPayload = Buffer.from(JSON.stringify(completedPayload)).toString(
    "base64url",
  );
  return {
    previewToken: `${encodedPayload}.${signature(encodedPayload, context.secret)}`,
    expiresAt,
  };
}

export function readImportPreviewToken<
  Payload extends { expiresAt: number },
>(
  token: string,
  schema: ZodType<Payload>,
  context: ImportTokenContext,
): Payload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, receivedSignature] = parts;
  if (!payload || !receivedSignature) return null;
  const expected = Buffer.from(signature(payload, context.secret));
  const received = Buffer.from(receivedSignature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  try {
    const parsed = schema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success || parsed.data.expiresAt <= context.now.getTime()) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
