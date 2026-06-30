import { NextResponse } from "next/server";

import { queueDemoPendingTransfer } from "@/lib/server/demo-seed";
import { getWallet } from "@/lib/server/wallet-store";

/** Simulate the AI agent queueing a high-value transfer for human approval. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      subOrganizationId?: string;
      transferSol?: number;
    };

    if (!body.subOrganizationId) {
      return NextResponse.json(
        { error: "subOrganizationId is required." },
        { status: 400 },
      );
    }

    const wallet = getWallet(body.subOrganizationId);
    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
    }

    const transferSol = body.transferSol ?? 1.0;
    const pending = await queueDemoPendingTransfer(wallet, transferSol);

    return NextResponse.json({ pending });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to seed pending tx.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
