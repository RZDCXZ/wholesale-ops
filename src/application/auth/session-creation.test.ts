import { describe, expect, it } from "vitest";

import { authorizeSessionCreation } from "./session-creation";

describe("新建会话", () => {
  it("启用账号可以新建会话", async () => {
    await expect(
      authorizeSessionCreation("active-user", async () => true),
    ).resolves.toEqual({ kind: "allowed" });
  });

  it("停用或不存在的账号不能新建会话", async () => {
    await expect(
      authorizeSessionCreation("inactive-user", async () => false),
    ).resolves.toEqual({ kind: "denied", reason: "inactive-account" });
    await expect(
      authorizeSessionCreation("missing-user", async () => null),
    ).resolves.toEqual({ kind: "denied", reason: "inactive-account" });
  });
});
