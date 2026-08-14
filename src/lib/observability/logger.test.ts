import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppLogger } from "./logger";

describe("createAppLogger", () => {
  beforeEach(() => {
    vi.stubEnv("LOG_LEVEL", "info");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    logger
      .child({
        session: "child-session-secret",
        component: "auth",
        req: { body: { password: "child-password-secret" } },
      })
      .info({ event: "auth.child.checked" });

    expect(output).not.toMatch(
      /demo-password-secret|demo-cookie-secret|demo-authorization-secret|demo-session-secret|demo-token-secret|child-session-secret|child-password-secret/,
    );
    expect(output).toContain('"component":"auth"');
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
        deeplyNested: {
          a: {
            b: {
              c: {
                d: { password: "arbitrary-depth-password-secret" },
              },
            },
          },
        },
      },
      event: "auth.request.rejected",
    });

    expect(output).not.toMatch(
      /nested-password-secret|nested-cookie-secret|nested-authorization-secret|nested-session-secret|nested-token-secret|arbitrary-depth-password-secret/,
    );
  });

  it("原始 Excel 行和客户敏感字段不会进入结构化日志", () => {
    let output = "";
    const logger = createAppLogger({
      write(chunk: string) {
        output += chunk;
      },
    });

    logger.info({
      event: "customer.import.rejected",
      import: {
        rawRows: [
          {
            customerCode: "KH-LOGGER-SECRET",
            name: "日志测试客户",
            contactName: "日志测试联系人",
            phone: "139 9999 9999",
            address: "日志测试敏感地址",
          },
        ],
        rowCount: 1,
      },
      customer: {
        customerCode: "KH-NESTED-SECRET",
        customerNameSnapshot: "嵌套日志测试客户",
        customerContactNameSnapshot: "嵌套日志测试联系人",
        customerPhoneSnapshot: "138 8888 8888",
        customerAddressSnapshot: "嵌套日志测试敏感地址",
      },
    });

    expect(output).not.toMatch(
      /KH-LOGGER-SECRET|日志测试客户|日志测试联系人|139 9999 9999|日志测试敏感地址|KH-NESTED-SECRET|嵌套日志测试客户|嵌套日志测试联系人|138 8888 8888|嵌套日志测试敏感地址/,
    );
    expect(output).toContain('"rowCount":1');
    expect(output).toContain('"event":"customer.import.rejected"');
  });

  it("脱敏时保留错误、日期与非循环共享结构的诊断信息", () => {
    let output = "";
    const logger = createAppLogger({
      write(chunk: string) {
        output += chunk;
      },
    });
    const sharedContext = { operation: "owner-login" };
    class LibraryContext {
      operation = "library-login";
      password = "class-password-secret";
    }
    class JsonLibraryContext {
      toJSON() {
        return {
          operation: "to-json-safe-value",
          password: "to-json-password-secret",
        };
      }
    }
    const error = Object.assign(new Error("diagnostic-boom"), {
      requestId: "request-safe-value",
      token: "error-token-secret",
    });

    logger.error({
      err: error,
      at: new Date("2026-08-13T00:00:00.000Z"),
      first: sharedContext,
      second: sharedContext,
      library: new LibraryContext(),
      hiddenLibrary: new JsonLibraryContext(),
    });

    expect(output).toContain("diagnostic-boom");
    expect(output).toContain('"type":"Error"');
    expect(output).toContain("2026-08-13T00:00:00.000Z");
    expect(output.match(/owner-login/g)).toHaveLength(2);
    expect(output).toContain("request-safe-value");
    expect(output).toContain("library-login");
    expect(output).toContain("to-json-safe-value");
    expect(output).not.toMatch(
      /class-password-secret|error-token-secret|to-json-password-secret/,
    );
    expect(output).not.toContain("[Circular]");
  });
});
