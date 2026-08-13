export async function authorizeSessionCreation(
  userId: string,
  findAccountEnabled: (userId: string) => Promise<boolean | null>,
): Promise<
  { kind: "allowed" } | { kind: "denied"; reason: "inactive-account" }
> {
  const enabled = await findAccountEnabled(userId);

  return enabled === true
    ? { kind: "allowed" }
    : { kind: "denied", reason: "inactive-account" };
}
