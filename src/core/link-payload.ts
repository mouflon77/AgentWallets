import { randomUUID } from "crypto";

/** Payload embedded in the setup QR code / deep link. */
export interface DeviceLinkPayload {
  /** v2 includes sub-org + address from CLI provisioning. */
  v: 1 | 2;
  portalUrl: string;
  walletName: string;
  userName: string;
  linkId: string;
  /** ISO-8601 expiry — links are single-use and time-boxed. */
  expiresAt: string;
  /** Turnkey sub-org created by `npm run setup` (v2 only). */
  subOrganizationId?: string;
  /** Solana address to fund before / after linking (v2 only). */
  solanaAddress?: string;
}

const LINK_TTL_MS = 15 * 60 * 1000;

export function createDeviceLinkPayload(input: {
  portalUrl: string;
  walletName: string;
  userName: string;
  ttlMs?: number;
  subOrganizationId?: string;
  solanaAddress?: string;
}): DeviceLinkPayload {
  const hasProvision =
    input.subOrganizationId !== undefined && input.solanaAddress !== undefined;

  return {
    v: hasProvision ? 2 : 1,
    portalUrl: input.portalUrl.replace(/\/$/, ""),
    walletName: input.walletName,
    userName: input.userName,
    linkId: randomUUID(),
    expiresAt: new Date(Date.now() + (input.ttlMs ?? LINK_TTL_MS)).toISOString(),
    ...(hasProvision
      ? {
          subOrganizationId: input.subOrganizationId,
          solanaAddress: input.solanaAddress,
        }
      : {}),
  };
}

export function encodeDeviceLink(payload: DeviceLinkPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeDeviceLink(setup: string): DeviceLinkPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(setup, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid setup link — could not decode payload.");
  }

  if (!isDeviceLinkPayload(parsed)) {
    throw new Error("Invalid setup link — malformed payload.");
  }

  if (new Date(parsed.expiresAt).getTime() < Date.now()) {
    throw new Error("This setup link has expired. Run the CLI again to generate a new QR code.");
  }

  return parsed;
}

export function buildDeviceLinkUrl(payload: DeviceLinkPayload): string {
  const setup = encodeDeviceLink(payload);
  return `${payload.portalUrl}/?setup=${setup}`;
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
