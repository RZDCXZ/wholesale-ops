import "dotenv/config";

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { readCliOption } from "./cli-options";
import {
  displayDatabaseTarget,
  validateLocalDatabaseTarget,
  verifyWholesaleOpsSchema,
} from "./local-database-target";
import { createPostgresBackup, inspectPostgresBackup } from "./postgres-tools";

function defaultBackupPath(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  return resolve("backups", `wholesale-ops-${timestamp}.dump`);
}

const target = validateLocalDatabaseTarget(process.env.DATABASE_URL);
const outputPath = resolve(
  readCliOption(process.argv, "--output") ?? defaultBackupPath(),
);
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
const database = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

try {
  await verifyWholesaleOpsSchema(database);
  console.log(`正在备份已验证目标：${displayDatabaseTarget(target)}`);
  const backup = createPostgresBackup(target);
  const contents = inspectPostgresBackup(target, backup);
  if (!contents.includes("TABLE DATA public sales_order")) {
    throw new Error("pg_restore 无法识别备份中的销售单数据。");
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(temporaryPath, backup, { flag: "wx", mode: 0o600 });
  renameSync(temporaryPath, outputPath);
  console.log(`PostgreSQL 自定义格式备份已生成：${outputPath}`);
} finally {
  rmSync(temporaryPath, { force: true });
  await database.$disconnect();
}
