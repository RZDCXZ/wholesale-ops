import { execFileSync } from "node:child_process";

import { ensureLocalEnv } from "./ensure-env.mjs";

const expectedNodeMajor = 24;
const currentNodeMajor = Number(process.versions.node.split(".")[0]);

if (currentNodeMajor !== expectedNodeMajor) {
  throw new Error(
    `需要 Node.js ${expectedNodeMajor}，当前为 ${process.versions.node}。`,
  );
}

if (ensureLocalEnv()) {
  console.log("已创建本地 .env，并生成认证密钥。");
}

const run = (command, args) =>
  execFileSync(command, args, { stdio: "inherit", env: process.env });

run("docker", ["compose", "up", "-d", "--wait", "db"]);
run("corepack", ["pnpm@11.21.0", "db:generate"]);
run("corepack", ["pnpm@11.21.0", "db:migrate"]);
run("corepack", ["pnpm@11.21.0", "db:seed"]);

console.log("初始化完成。运行 pnpm dev 启动正式应用。");
