import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { exportOrganizationData } from "@/modules/organizations/gdpr-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { errorResponse } from "@/shared/http/response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Streams a JSON file download rather than the standard envelope — same
// binary/file-response pattern as documents/[id]/content and
// payment-intents/[id]/invoice, still going through the same authorization path.
export async function GET(request: NextRequest, { params }: Ctx) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const { id } = await params;
    const actor = await getSessionActorContext(request);
    const data = await exportOrganizationData(actor, id);

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="organization-data-export.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
