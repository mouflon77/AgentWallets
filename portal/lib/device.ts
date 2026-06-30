"use client";

import { UserDevice } from "agentwallets/browser";

let device: UserDevice | null = null;

/** Shared browser client for Passkey registration, login, and signing. */
export function getUserDevice(): UserDevice {
  if (device) return device;

  const organizationId = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID;
  const rpId = process.env.NEXT_PUBLIC_RP_ID ?? "localhost";

  if (!organizationId) {
    throw new Error("NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID is not set.");
  }

  device = new UserDevice({
    rpId,
    organizationId,
    apiBaseUrl: process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL,
  });

  return device;
}
