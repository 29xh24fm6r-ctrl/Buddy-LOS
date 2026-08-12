export type CleanupJob = { jobId: string; bucket: string; path: string; disposalPath: string };
export type CleanupDependencies = {
  move: (from: string, to: string) => Promise<void>;
  complete: (jobId: string, disposalPath: string) => Promise<void>;
  fail: (jobId: string, message: string) => Promise<void>;
};

export async function runDocumentCleanup(job: CleanupJob, dependencies: CleanupDependencies) {
  if (job.bucket !== "loan-documents" || !job.path || !job.disposalPath.startsWith("_disposal/")) {
    await dependencies.fail(job.jobId, "Invalid cleanup object identity.");
    return { status: "failed" as const };
  }
  try { await dependencies.move(job.path, job.disposalPath); }
  catch {
    await dependencies.fail(job.jobId, "Storage disposal move failed.");
    return { status: "retryable" as const };
  }
  try {
    await dependencies.complete(job.jobId, job.disposalPath);
    return { status: "completed" as const };
  } catch {
    try { await dependencies.move(job.disposalPath, job.path); }
    catch { throw new Error("Cleanup finalization failed and the disposal move could not be restored."); }
    await dependencies.fail(job.jobId, "Cleanup evidence failed; storage move restored.");
    return { status: "restored" as const };
  }
}
