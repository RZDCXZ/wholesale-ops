import type { PrismaClient } from "../src/generated/prisma/client";

const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);
const requiredMigration = "20260814123000_payment_reversals";

export function validateLocalDatabaseTarget(value: string | undefined): URL {
  if (!value) {
    throw new Error("DATABASE_URL 未配置，不能操作数据库。");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL 不是有效的 PostgreSQL 地址。");
  }

  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !localHostnames.has(url.hostname)
  ) {
    throw new Error("只允许操作本机 PostgreSQL 演示数据库。");
  }
  if (decodeURIComponent(url.username) !== "wholesale_ops") {
    throw new Error("本地数据库用户必须是 wholesale_ops。");
  }
  if (decodeURIComponent(url.pathname.slice(1)) !== "wholesale_ops") {
    throw new Error("本地数据库名称必须是 wholesale_ops。");
  }
  if ((url.searchParams.get("schema") ?? "public") !== "public") {
    throw new Error("本地数据库 schema 必须是 public。");
  }

  return url;
}

export function displayDatabaseTarget(url: URL): string {
  const port = url.port || "5432";
  return `${url.hostname}:${port}/${decodeURIComponent(url.pathname.slice(1))}`;
}

export async function verifyWholesaleOpsSchema(
  database: PrismaClient,
): Promise<void> {
  const migrations = await database.$queryRawUnsafe<
    Array<{ migration_name: string; finished_at: Date | null }>
  >(
    `SELECT migration_name, finished_at
     FROM "_prisma_migrations"
     WHERE migration_name = $1`,
    requiredMigration,
  );
  if (migrations.length !== 1 || !migrations[0]?.finished_at) {
    throw new Error("目标不是已完成全部 migration 的批发经营台账数据库。");
  }
}
