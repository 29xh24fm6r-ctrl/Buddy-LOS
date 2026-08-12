"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccessContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canRequestUnderwriting } from "@/lib/underwriting/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestBuddyUnderwriting(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const documentIds = [...new Set(formData.getAll("documentId").map(String))];
  const returnTo = UUID.test(dealId) ? `/app/deals/${dealId}` : "/app/deals";
  if (process.env.BUDDY_UNDERWRITER_RUNTIME_ENABLED !== "true") redirect(`${returnTo}?underwriting=runtime-disabled`);
  if (!UUID.test(dealId) || documentIds.length < 1 || documentIds.length > 100 || documentIds.some((id) => !UUID.test(id)) || idempotencyKey.length < 8 || idempotencyKey.length > 200)
    redirect(`${returnTo}?underwriting=invalid-request`);

  const context = await loadAccessContext();
  if (context.kind === "unauthenticated") redirect("/login");
  if (context.kind !== "ready" || !canRequestUnderwriting(context.activeOrganization.role)) redirect(`${returnTo}?underwriting=not-authorized`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_underwriting_job", {
    p_organization_id: context.activeOrganization.organizationId,
    p_deal_id: dealId,
    p_document_ids: documentIds,
    p_idempotency_key: idempotencyKey,
  });
  const result = data as { jobId?: unknown } | null;
  if (error || typeof result?.jobId !== "string" || !UUID.test(result.jobId)) redirect(`${returnTo}?underwriting=request-failed`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?underwriting=requested`);
}
