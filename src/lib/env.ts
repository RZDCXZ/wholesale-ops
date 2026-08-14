import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    DATABASE_URL: z.url(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    WHOLESALE_OPS_ACCEPTANCE: z.enum(["0", "1"]).default("0"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((environment, context) => {
    const authHostname = new URL(environment.BETTER_AUTH_URL).hostname;
    if (
      environment.WHOLESALE_OPS_ACCEPTANCE === "1" &&
      authHostname !== "localhost" &&
      authHostname !== "127.0.0.1"
    ) {
      context.addIssue({
        code: "custom",
        path: ["WHOLESALE_OPS_ACCEPTANCE"],
        message: "验收模式只允许用于本机服务。",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let parsedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  parsedEnvironment ??= serverEnvironmentSchema.parse(process.env);
  return parsedEnvironment;
}
