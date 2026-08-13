import { cookies } from "next/headers";

import {
  AccountServiceError,
  getBusinessAudit,
} from "@/application/accounts/account-service";
import { readAccountActionNotice } from "@/lib/account-action-notice";
import { getCurrentActor } from "@/lib/current-actor";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("account-action-notice")?.value;
  cookieStore.set("account-action-notice", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  if (!token) return new Response(null, { status: 204 });

  const authentication = await getCurrentActor();
  const notice = readAccountActionNotice(token);
  if (
    authentication.kind !== "authenticated" ||
    !notice ||
    notice.actorId !== authentication.actor.id
  ) {
    return new Response(null, { status: 204 });
  }

  try {
    const audit = await getBusinessAudit(
      prisma,
      authentication.actor,
      notice.auditId,
    );
    const messages: Record<string, string> = {
      ACCOUNT_CREATED: "账号已创建。",
      ACCOUNT_ROLES_UPDATED: "账号角色已更新。",
      ACCOUNT_DISABLED: "账号已停用，已有会话已撤销。",
    };
    const message = messages[audit.action];
    if (!message || audit.objectType !== "ACCOUNT") {
      return new Response(null, { status: 204 });
    }

    return Response.json({ message, auditHref: `/audit?detail=${audit.id}` });
  } catch (error) {
    if (error instanceof AccountServiceError) {
      return new Response(null, { status: 204 });
    }
    throw error;
  }
}
