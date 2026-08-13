import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function ensureLocalEnv() {
  if (existsSync(".env")) {
    return false;
  }

  const example = readFileSync(".env.example", "utf8");
  const secret = randomBytes(32).toString("base64url");

  writeFileSync(
    ".env",
    example.replace(
      "replace-with-a-generated-local-secret-at-least-32-characters",
      secret,
    ),
    { mode: 0o600 },
  );

  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(ensureLocalEnv() ? "已创建本地 .env。" : "本地 .env 已存在。");
}
