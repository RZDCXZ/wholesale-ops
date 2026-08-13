import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import "dotenv/config";

import { PrismaClient, RoleCode } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const authUrl = process.env.BETTER_AUTH_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;

if (!databaseUrl || !authUrl || !authSecret) {
  throw new Error("数据库与认证环境变量必须在 seed 前配置。 ");
}

const adapter = new PrismaPg(databaseUrl);
const prisma = new PrismaClient({ adapter });
const seedAuth = betterAuth({
  appName: "批发经营台账",
  baseURL: authUrl,
  secret: authSecret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: false,
  },
});

const demoPassword = "demo123456";
const demoAccounts = [
  {
    name: "张伟",
    email: "owner@example.local",
    roles: [RoleCode.OWNER],
  },
  {
    name: "陈敏",
    email: "sales@example.local",
    roles: [RoleCode.SALES],
  },
  {
    name: "王强",
    email: "warehouse@example.local",
    roles: [RoleCode.WAREHOUSE],
  },
  {
    name: "刘芳",
    email: "finance@example.local",
    roles: [RoleCode.FINANCE],
  },
  {
    name: "赵磊",
    email: "multi@example.local",
    roles: [RoleCode.SALES, RoleCode.WAREHOUSE],
  },
] as const;

const demoSkus = [
  {
    id: "demo-sku-wj-ls-001",
    skuCode: "WJ-LS-001",
    name: "304 不锈钢六角螺栓 M8×30",
    category: "紧固件",
    inventoryUnit: "盒",
    referencePriceFen: 4_850,
    warningThreshold: 20,
    enabled: true,
  },
  {
    id: "demo-sku-wj-qp-004",
    skuCode: "WJ-QP-004",
    name: "树脂切割片 105mm",
    category: "切削耗材",
    inventoryUnit: "片",
    referencePriceFen: 380,
    warningThreshold: 15,
    enabled: true,
  },
] as const;

try {
  for (const account of demoAccounts) {
    let user = await prisma.user.findUnique({
      where: { email: account.email },
    });

    if (!user) {
      const created = await seedAuth.api.signUpEmail({
        body: {
          name: account.name,
          email: account.email,
          password: demoPassword,
        },
      });
      user = await prisma.user.findUniqueOrThrow({
        where: { id: created.user.id },
      });
    }

    const password = await hashPassword(demoPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { name: account.name, enabled: true },
      }),
      prisma.userRole.deleteMany({ where: { userId: user.id } }),
      prisma.userRole.createMany({
        data: account.roles.map((role) => ({ userId: user.id, role })),
      }),
      prisma.account.updateMany({
        where: { userId: user.id, providerId: "credential" },
        data: { password },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
  }

  for (const sku of demoSkus) {
    await prisma.sku.upsert({
      where: { skuCode: sku.skuCode },
      create: sku,
      update: {
        name: sku.name,
        category: sku.category,
        inventoryUnit: sku.inventoryUnit,
        referencePriceFen: sku.referencePriceFen,
        warningThreshold: sku.warningThreshold,
        enabled: sku.enabled,
      },
    });
  }

  console.log(`已写入 ${demoAccounts.length} 个虚构演示账号和 ${demoSkus.length} 个虚构 SKU。`);
} finally {
  await prisma.$disconnect();
}
