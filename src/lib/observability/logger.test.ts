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

  it("嵌套请求对象中的认证字段也不会进入日志", () => {
    let output = "";
    const logger = createAppLogger({
      write(chunk: string) {
        output += chunk;
      },
    });

    logger.warn({
      req: {
        body: { password: "nested-password-secret" },
        headers: {
          cookie: "session=nested-cookie-secret",
          authorization: "Bearer nested-authorization-secret",
        },
        context: {
          session: "nested-session-secret",
          token: "nested-token-secret",
        },
      },
      event: "auth.request.rejected",
    });

    expect(output).not.toMatch(
      /nested-password-secret|nested-cookie-secret|nested-authorization-secret|nested-session-secret|nested-token-secret/,
    );
  });
});
