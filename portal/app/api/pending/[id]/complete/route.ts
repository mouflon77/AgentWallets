import { NextResponse } from "next/server";

import { getPending, markApproved } from "@/lib/server/pending-store";

type RouteContext = { params: Promise<{ id: string }> };

/** Mark a pending transaction as approved after the user signs on-device. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { signedSerializedTx?: string };

    if (!body.signedSerializedTx) {
      return NextResponse.json(
        { error: "signedSerializedTx is required." },
        { status: 400 },
      );
    }

    const existing = getPending(id);
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    if (existing.status !== "pending") {
      return NextResponse.json(
        { error: "Transaction is no longer pending." },
        { status: 409 },
      );
    }

    const approved = markApproved(id, body.signedSerializedTx);
    return NextResponse.json({ approved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete approval.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
