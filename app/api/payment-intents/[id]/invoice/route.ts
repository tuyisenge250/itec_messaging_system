import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getOrCreateInvoiceForPaymentIntent } from "@/modules/billing/invoice-service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { errorResponse } from "@/shared/http/response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Raw binary content doesn't fit the standard `{success, data}` JSON envelope,
// so this route is intentionally outside withRoute() — same pattern as
// app/api/documents/[id]/content/route.ts — but still goes through the same
// authorization path as every other payment-intent endpoint.
export async function GET(request: NextRequest, { params }: Ctx) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const { id } = await params;
    const actor = await getActorContext(request);
    const { invoiceNumber, pdf } = await getOrCreateInvoiceForPaymentIntent(actor, id);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
