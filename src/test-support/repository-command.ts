import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const declaredPackageManager = (
  JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { packageManager?: unknown }
).packageManager;

if (
  typeof declaredPackageManager !== "string" ||
  !declaredPackageManager.startsWith("pnpm@")
) {
  throw new Error("package.json 必须声明固定版本的 pnpm packageManager。");
}
const packageManager = declaredPackageManager;

export function runRepositoryCommand(
  command: string,
  args: readonly string[] = [],
  options: { env?: NodeJS.ProcessEnv; timeout?: number } = {},
) {
  return execFileAsync(
    "corepack",
    [packageManager, command, ...(args.length ? ["--", ...args] : [])],
    {
      cwd: repositoryRoot,
      env: options.env ?? process.env,
      timeout: options.timeout,
    },
  );
}
