import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { resetDemoData } from "../src/application/demo-data/reset-demo-data";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  displayDatabaseTarget,
  validateLocalDatabaseTarget,
  verifyWholesaleOpsSchema,
} from "./local-database-target";

const target = validateLocalDatabaseTarget(process.env.DATABASE_URL);
const targetDisplay = displayDatabaseTarget(target);
const confirmed = process.argv.includes("--yes");

console.warn(`警告：即将销毁 ${targetDisplay} 中的全部本地演示数据。`);
if (!confirmed) {
  throw new Error("请确认目标后使用 --yes 执行演示重置。");
}

const database = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});
const injectedNow = process.env.WHOLESALE_OPS_DEMO_NOW;
const now = injectedNow ? new Date(injectedNow) : new Date();
if (Number.isNaN(now.getTime())) {
  throw new Error("WHOLESALE_OPS_DEMO_NOW 必须是有效日期时间。");
}

try {
  await verifyWholesaleOpsSchema(database);
  const result = await resetDemoData(database, now);
  console.log(
    `演示重置完成（中国标准时间 ${result.asOfDate}）：5 个账号、30 个 SKU、8 个客户、20 张销售单。`,
  );
} finally {
  await database.$disconnect();
}
