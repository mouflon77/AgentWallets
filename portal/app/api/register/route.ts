import { NextResponse } from "next/server";

import { createSecureWallet } from "@/lib/server/create-wallet";
import { linkGuardianToProvisionedWallet } from "@/lib/server/link-guardian";
import { saveWallet } from "@/lib/server/wallet-store";
import type { PasskeyRegistration } from "agentwallets";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      displayName?: string;
      walletName?: string;
      subOrganizationId?: string;
      passkey?: PasskeyRegistration;
    };

    if (!body.displayName?.trim() || !body.passkey) {
      return NextResponse.json(
        { error: "displayName and passkey are required." },
        { status: 400 },
      );
    }

    const wallet = body.subOrganizationId?.trim()
      ? await linkGuardianToProvisionedWallet({
          subOrganizationId: body.subOrganizationId.trim(),
          userDisplayName: body.displayName.trim(),
          passkey: body.passkey,
        })
      : await createSecureWallet({
          walletName: body.walletName?.trim() || `${body.displayName.trim()} Agent Wallet`,
          userDisplayName: body.displayName.trim(),
          passkey: body.passkey,
        });

    saveWallet(wallet);

    return NextResponse.json({
      subOrganizationId: wallet.subOrganizationId,
      solanaAddress: wallet.solanaAddress,
      walletId: wallet.walletId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
