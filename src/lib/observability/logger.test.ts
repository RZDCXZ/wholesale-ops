import { describe, expect, it } from "vitest";

import { createAppLogger } from "./logger";

describe("createAppLogger", () => {
  it("结构化日志不会输出密码、Cookie、授权头、会话或令牌值", () => {
    let output = "";
    const logger = createAppLogger({
      write(chunk: string) {
        output += chunk;
      },
    });

    logger.info({
      password: "demo-password-secret",
      headers: {
        cookie: "session=demo-cookie-secret",
        authorization: "Bearer demo-authorization-secret",
      },
      session: "demo-session-secret",
      token: "demo-token-secret",
      event: "auth.boundary.checked",
    });

    expect(output).not.toMatch(
      /demo-password-secret|demo-cookie-secret|demo-authorization-secret|demo-session-secret|demo-token-secret/,
    );
  });
});
