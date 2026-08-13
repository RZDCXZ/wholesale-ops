import pino, { type DestinationStream, type Logger } from "pino";

type WriteStreamLike = {
  write(chunk: string): unknown;
};

const sensitivePaths = [
  "password",
  "*.password",
  "cookie",
  "*.cookie",
  "authorization",
  "*.authorization",
  "headers.cookie",
  "headers.authorization",
  "req.headers.cookie",
  "req.headers.authorization",
  "request.headers.cookie",
  "request.headers.authorization",
  "session",
  "*.session",
  "token",
  "*.token",
];

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
