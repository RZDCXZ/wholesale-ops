import pino, { type DestinationStream, type Logger } from "pino";

type WriteStreamLike = {
  write(chunk: string): unknown;
};

const sensitiveFieldNames = [
  "password",
  "cookie",
  "Cookie",
  "authorization",
  "Authorization",
  "session",
  "token",
  "sessionToken",
  "accessToken",
  "refreshToken",
  "idToken",
];

const sensitivePaths = sensitiveFieldNames.flatMap((fieldName) =>
  Array.from({ length: 5 }, (_, depth) =>
    depth === 0 ? fieldName : `${"*.".repeat(depth)}${fieldName}`,
  ),
);

export function createAppLogger(destination?: WriteStreamLike): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: undefined,
      redact: {
        paths: sensitivePaths,
        remove: true,
      },
    },
    destination as DestinationStream | undefined,
  );
}

export const logger = createAppLogger();
