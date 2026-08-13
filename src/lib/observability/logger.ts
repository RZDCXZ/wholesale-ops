import pino, { type DestinationStream, type Logger } from "pino";

type WriteStreamLike = {
  write(chunk: string): unknown;
};

const sensitiveFieldNames = new Set([
  "password",
  "cookie",
  "set-cookie",
  "authorization",
  "session",
  "token",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "idtoken",
]);

function removeSensitiveFields(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const sanitized = value.map((item) => removeSensitiveFields(item, seen));
    seen.delete(value);
    return sanitized;
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  const sanitized = Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      sensitiveFieldNames.has(key.toLowerCase())
        ? []
        : [[key, removeSensitiveFields(nestedValue, seen)]],
    ),
  );
  seen.delete(value);
  return sanitized;
}

export function createAppLogger(destination?: WriteStreamLike): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: undefined,
      formatters: {
        log(object) {
          return removeSensitiveFields(object) as Record<string, unknown>;
        },
      },
    },
    destination as DestinationStream | undefined,
  );
}

export const logger = createAppLogger();
