import { z } from "zod";

const serverEnvironmentSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let parsedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  parsedEnvironment ??= serverEnvironmentSchema.parse(process.env);
  return parsedEnvironment;
}
