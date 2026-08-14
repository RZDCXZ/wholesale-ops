import pino, { type DestinationStream, type Logger } from "pino";

type WriteStreamLike = {
  write(chunk: string): unknown;
};

const sensitiveFieldNames = new Set([
  "password",
  "cookie",
  "setcookie",
  "authorization",
  "session",
  "token",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "row",
  "rows",
  "rawrow",
  "rawrows",
  "worksheetrow",
  "worksheetrows",
  "excelrow",
  "excelrows",
  "customer",
  "customerid",
  "customercode",
  "customername",
  "customercontactname",
  "customerphone",
  "customeraddress",
  "customercodesnapshot",
  "customernamesnapshot",
  "customercontactnamesnapshot",
  "customerphonesnapshot",
  "customeraddresssnapshot",
  "contactname",
  "phone",
  "address",
]);

function isSensitiveFieldName(fieldName: string): boolean {
  return sensitiveFieldNames.has(
    fieldName.toLowerCase().replaceAll(/[^a-z0-9]/g, ""),
  );
}

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

  if (!(value instanceof Error)) {
    try {
      const toJSON = (value as { toJSON?: unknown }).toJSON;

      if (typeof toJSON === "function") {
        if (seen.has(value)) {
          return "[Circular]";
        }

        seen.add(value);
        const serialized = toJSON.call(value) as unknown;
        const sanitized =
          serialized && typeof serialized === "object"
            ? removeSensitiveFields(serialized, seen)
            : {};
        seen.delete(value);
        return sanitized;
      }
    } catch {
      seen.delete(value);
      return {};
    }
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
      isSensitiveFieldName(key)
        ? []
        : [[key, removeSensitiveFields(nestedValue, seen)]],
    ),
  );
  seen.delete(value);

  if (value instanceof Error) {
    const sanitizedError = Object.assign(
      new Error(value.message),
      sanitizedFields,
    );
    sanitizedError.name = value.name;
    sanitizedError.stack = value.stack;
    return sanitizedError;
  }

  return sanitizedFields;
}

function sanitizeLogChunk(chunk: string): string {
  return chunk
    .split("\n")
    .map((line) => {
      if (!line) {
        return line;
      }

      try {
        return JSON.stringify(removeSensitiveFields(JSON.parse(line)));
      } catch {
        return JSON.stringify({
          level: 50,
          event: "logger.output.sanitization.failed",
        });
      }
    })
    .join("\n");
}

function createSanitizingDestination(
  destination?: WriteStreamLike,
): DestinationStream {
  const target = destination ?? process.stdout;

  return {
    write(chunk: string) {
      target.write(sanitizeLogChunk(chunk));
    },
  } as DestinationStream;
}

export function createAppLogger(destination?: WriteStreamLike): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: undefined,
      formatters: {
        bindings(bindings) {
          return removeSensitiveFields(bindings) as Record<string, unknown>;
        },
        log(object) {
          return removeSensitiveFields(object) as Record<string, unknown>;
        },
      },
    },
    createSanitizingDestination(destination),
  );
}

export const logger = createAppLogger();
