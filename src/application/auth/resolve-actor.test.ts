import { describe, expect, it } from "vitest";

import { authorizeActor, resolveActor } from "./resolve-actor";

describe("resolveActor", () => {
  it("未登录访问服务端入口时返回缺少会话", async () => {
    const result = await resolveActor({
      readSession: async () => null,
      findIdentity: async () => null,
    });

    expect(result).toEqual({
      kind: "unauthenticated",
      reason: "missing-session",
    });
  });

  it("只用会话中的 user id 从服务端身份库解析老板角色", async () => {
    const result = await resolveActor({
      readSession: async () => ({ userId: "user-owner" }),
      findIdentity: async (userId) => ({
        id: userId,
        name: "张伟",
        email: "owner@example.local",
        enabled: true,
        roles: ["OWNER"],
      }),
    });

    expect(result).toEqual({
      kind: "authenticated",
      actor: {
        id: "user-owner",
        name: "张伟",
        email: "owner@example.local",
        roles: ["OWNER"],
      },
    });
  });

  it("会话引用的用户不存在时返回会话无效", async () => {
    const result = await resolveActor({
      readSession: async () => ({ userId: "deleted-user" }),
      findIdentity: async () => null,
    });

    expect(result).toEqual({
      kind: "unauthenticated",
      reason: "invalid-session",
    });
  });

  it("停用账号已有的会话不能继续取得受保护数据", async () => {
    const result = await resolveActor({
      readSession: async () => ({ userId: "inactive-owner" }),
      findIdentity: async (userId) => ({
        id: userId,
        name: "张伟",
        email: "owner@example.local",
        enabled: false,
        roles: ["OWNER"],
      }),
    });

    expect(result).toEqual({
      kind: "unauthenticated",
      reason: "inactive-account",
    });
  });
});

describe("authorizeActor", () => {
  it("没有老板角色的已登录用户不能进入老板工作区", () => {
    const result = authorizeActor(
      {
        id: "finance-user",
        name: "刘芳",
        email: "finance@example.local",
        roles: ["FINANCE"],
      },
      "OWNER",
    );

    expect(result).toEqual({ kind: "forbidden", requiredRole: "OWNER" });
  });

  it("老板角色可以进入老板工作区", () => {
    const actor = {
      id: "owner-user",
      name: "张伟",
      email: "owner@example.local",
      roles: ["OWNER"] as ["OWNER"],
    };

    expect(authorizeActor(actor, "OWNER")).toEqual({
      kind: "authorized",
      actor,
    });
  });
});
