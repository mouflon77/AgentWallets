/** Payload embedded in the setup QR code / deep link (matches SDK `link-payload.ts`). */
export interface DeviceLinkPayload {
  v: 1 | 2;
  portalUrl: string;
  walletName: string;
  userName: string;
  linkId: string;
  expiresAt: string;
  subOrganizationId?: string;
  solanaAddress?: string;
}

function isDeviceLinkPayload(value: unknown): value is DeviceLinkPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    (payload.v === 1 || payload.v === 2) &&
    typeof payload.portalUrl === "string" &&
    typeof payload.walletName === "string" &&
    typeof payload.userName === "string" &&
    typeof payload.linkId === "string" &&
    typeof payload.expiresAt === "string" &&
    (payload.subOrganizationId === undefined ||
      typeof payload.subOrganizationId === "string") &&
    (payload.solanaAddress === undefined || typeof payload.solanaAddress === "string")
  );
}

/** Parse the `?setup=` query param from a CLI-generated QR code. */
export function parseSetupLink(setupParam: string | null): DeviceLinkPayload | null {
  if (!setupParam) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(setupParam, "base64url").toString("utf8"),
    );
  } catch {
    throw new Error("Invalid setup link — could not decode payload.");
  }

  if (!isDeviceLinkPayload(parsed)) {
    throw new Error("Invalid setup link — malformed payload.");
  }

  if (new Date(parsed.expiresAt).getTime() < Date.now()) {
    throw new Error(
      "This setup link has expired. Run `npm run setup` again at the repo root.",
    );
  }

  return parsed;
}
