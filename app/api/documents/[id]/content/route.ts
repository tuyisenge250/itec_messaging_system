import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readDocumentContent } from "@/modules/documents/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { errorResponse } from "@/shared/http/response";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Raw binary content doesn't fit the standard `{success, data}` JSON envelope,
// so this route is intentionally outside the withRoute() wrapper — but still
// goes through the same authorization path as every other document endpoint.
export async function GET(request: NextRequest, { params }: Ctx) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const { id } = await params;
    const actor = await getSessionActorContext(request);
    const { document, buffer } = await readDocumentContent(actor, id);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${document.originalFilename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
