import { spawnSync } from "node:child_process";

const postgresImage = "postgres:18-alpine";
const maxToolOutputBytes = 128 * 1024 * 1024;

function clientDatabaseUrl(target: URL): string {
  const url = new URL(target);
  url.hostname = "host.docker.internal";
  url.password = "";
  url.searchParams.delete("schema");
  return url.toString();
}

export function runPostgresTool(
  target: URL,
  tool: "pg_dump" | "pg_restore",
  args: string[],
  input?: Buffer,
  connect = true,
): Buffer {
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-i",
      "--add-host",
      "host.docker.internal:host-gateway",
      "-e",
      "PGPASSWORD",
      postgresImage,
      tool,
      ...args,
      ...(connect ? ["--dbname", clientDatabaseUrl(target)] : []),
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: decodeURIComponent(target.password),
      },
      input,
      encoding: null,
      maxBuffer: maxToolOutputBytes,
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = result.stderr?.toString("utf8").trim();
    throw new Error(
      `${tool} 执行失败${message ? `：${message}` : "。"}`,
    );
  }
  return result.stdout ?? Buffer.alloc(0);
}

export function createPostgresBackup(target: URL): Buffer {
  return runPostgresTool(target, "pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
  ]);
}

export function inspectPostgresBackup(target: URL, backup: Buffer): string {
  return runPostgresTool(
    target,
    "pg_restore",
    ["--list"],
    backup,
    false,
  ).toString("utf8");
}

export function restorePostgresBackup(target: URL, backup: Buffer): void {
  runPostgresTool(
    target,
    "pg_restore",
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
    ],
    backup,
  );
}
