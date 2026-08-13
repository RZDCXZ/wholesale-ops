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

  if (value instanceof Date) {
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

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  const sanitizedFields = Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      sensitiveFieldNames.has(key.toLowerCase())
        ? []
        : [[key, removeSensitiveFields(nestedValue, seen)]],
    ),
  );
  seen.delete(value);

  if (value instanceof Error) {
    return {
      ...sanitizedFields,
      type: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Object.keys(sanitizedFields).length === 0 && Object.keys(value).length === 0) {
    return value;
  }

  return sanitizedFields;
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
