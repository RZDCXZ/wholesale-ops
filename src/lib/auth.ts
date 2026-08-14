import "server-only";

import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/db";
import { authorizeSessionCreation } from "@/application/auth/session-creation";
import { getServerEnvironment } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

const environment = getServerEnvironment();

export const auth = betterAuth({
  appName: "批发经营台账",
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  trustedOrigins: [environment.BETTER_AUTH_URL, "http://127.0.0.1:3000"],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  // 仅在受控验收模式关闭；其他环境保留 Better Auth 的生产默认限流。
  rateLimit:
    environment.WHOLESALE_OPS_ACCEPTANCE === "1"
      ? { enabled: false }
      : undefined,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    session: {
      create: {
        async before(session) {
          const authorization = await authorizeSessionCreation(
            session.userId,
            async (userId) => {
              const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { enabled: true },
              });
              return user?.enabled ?? null;
            },
          );

          if (authorization.kind === "denied") {
            throw new APIError("UNAUTHORIZED", {
              code: "INVALID_EMAIL_OR_PASSWORD",
              message: "Invalid email or password",
            });
          }
        },
      },
    },
  },
  logger: {
    level: "error",
    disableColors: true,
    log(level) {
      const pinoLevel = level === "warn" ? "warn" : level;
      logger[pinoLevel]({
        event: "auth.library.message",
        source: "better-auth",
        authLevel: level,
      });
    },
  },
});
