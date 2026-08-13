import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
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

const ownerEmail = "owner@example.local";
const ownerPassword = "demo123456";

try {
  let owner = await prisma.user.findUnique({ where: { email: ownerEmail } });

  if (!owner) {
    const created = await seedAuth.api.signUpEmail({
      body: {
        name: "张伟",
        email: ownerEmail,
        password: ownerPassword,
      },
    });
    owner = await prisma.user.findUniqueOrThrow({
      where: { id: created.user.id },
    });
  }

  await prisma.user.update({
    where: { id: owner.id },
    data: { name: "张伟", enabled: true },
  });
  await prisma.userRole.upsert({
    where: {
      userId_role: { userId: owner.id, role: RoleCode.OWNER },
    },
    update: {},
    create: { userId: owner.id, role: RoleCode.OWNER },
  });
  await prisma.session.deleteMany({ where: { userId: owner.id } });

  console.log(`已写入虚构老板账号：${ownerEmail}`);
} finally {
  await prisma.$disconnect();
}
