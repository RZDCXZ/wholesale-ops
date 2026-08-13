export function isSerializationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = error.code;
  if (code === "P2034") return true;
  if (code !== "P2010") return false;
  const meta =
    "meta" in error && error.meta && typeof error.meta === "object"
      ? error.meta
      : undefined;
  const databaseCode = meta && "code" in meta ? meta.code : undefined;
  const message = error instanceof Error ? error.message : "";
  return (
    databaseCode === "40001" ||
    message.includes("40001") ||
    message.toLocaleLowerCase("en").includes("serialize")
  );
}
