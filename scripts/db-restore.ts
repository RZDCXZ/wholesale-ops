import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { readCliOption } from "./cli-options";
import {
  displayDatabaseTarget,
  validateLocalDatabaseTarget,
  verifyWholesaleOpsSchema,
} from "./local-database-target";
import {
  inspectPostgresBackup,
  restorePostgresBackup,
} from "./postgres-tools";

function requiredOption(name: string): string {
  const value = readCliOption(process.argv, name);
  if (!value) throw new Error(`缺少 ${name} 参数。`);
  return value;
}

const target = validateLocalDatabaseTarget(process.env.DATABASE_URL);
const targetDisplay = displayDatabaseTarget(target);
const inputPath = resolve(requiredOption("--input"));
const backup = readFileSync(inputPath);
const database = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

console.warn(`警告：即将以 ${inputPath} 覆盖 ${targetDisplay} 的全部本地数据。`);
if (!process.argv.includes("--yes")) {
  throw new Error("请确认目标和备份文件后使用 --yes 执行恢复。");
}

try {
  await verifyWholesaleOpsSchema(database);
  const contents = inspectPostgresBackup(target, backup);
  if (!contents.includes("TABLE DATA public sales_order")) {
    throw new Error("所选文件不是可恢复的批发经营台账 PostgreSQL 备份。");
  }
  restorePostgresBackup(target, backup);
  await verifyWholesaleOpsSchema(database);
  console.log(`恢复完成：${targetDisplay} 已由 ${inputPath} 覆盖。`);
} finally {
  await database.$disconnect();
}
