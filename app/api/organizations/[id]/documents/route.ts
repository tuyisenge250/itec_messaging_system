import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { uploadDocument, listDocuments } from "@/modules/documents/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const senderIdRequestId = request.nextUrl.searchParams.get("senderIdRequestId") ?? undefined;
  const documents = await listDocuments(actor, id, senderIdRequestId);
  return ok({ documents }, requestId);
});

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);

  const formData = await request.formData();
  const file = formData.get("file");
  const documentRequirementCode = formData.get("documentRequirementCode");
  const senderIdRequestId = formData.get("senderIdRequestId");

  if (!(file instanceof File) || typeof documentRequirementCode !== "string") {
    throw AppError.validation("file and documentRequirementCode are required");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const document = await uploadDocument(actor, {
    organizationId: id,
    senderIdRequestId: typeof senderIdRequestId === "string" ? senderIdRequestId : undefined,
    documentRequirementCode,
    file: { buffer, originalFilename: file.name, mimeType: file.type || "application/octet-stream" },
  });

  return created(document, requestId);
});
