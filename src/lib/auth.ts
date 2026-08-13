import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

type CreateAuthOptions = {
  allowInternalSeedSignUp?: boolean;
};

export function createAuth(options: CreateAuthOptions = {}) {
  const environment = getServerEnvironment();

  return betterAuth({
    appName: "批发经营台账",
    baseURL: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.BETTER_AUTH_URL, "http://127.0.0.1:3000"],
    database: prismaAdapter(prisma, {
      provider: "postgresql",
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowInternalSeedSignUp,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    logger: {
      level: "error",
      disableColors: true,
      log(level, message) {
        const pinoLevel = level === "warn" ? "warn" : level;
        logger[pinoLevel]({ source: "better-auth" }, message);
      },
    },
  });
}

export const auth = createAuth();
