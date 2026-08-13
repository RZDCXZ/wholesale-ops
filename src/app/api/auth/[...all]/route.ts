import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  if (pathname === "/api/auth/update-user") {
    return Response.json(
      { code: "FORBIDDEN", message: "Forbidden" },
      { status: 403 },
    );
  }

  return handlers.POST(request);
}
