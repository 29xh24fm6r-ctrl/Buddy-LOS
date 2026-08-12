import { describe, expect, it, vi } from "vitest";
import { runDocumentCleanup } from "./document-cleanup-worker";

const job={jobId:"job-1",bucket:"loan-documents",path:"org/deal/document.pdf",disposalPath:"_disposal/org/document/job-1"};
describe("document cleanup recovery",()=>{
  it("moves then records the tombstone",async()=>{const move=vi.fn().mockResolvedValue(undefined),complete=vi.fn().mockResolvedValue(undefined),fail=vi.fn();expect(await runDocumentCleanup(job,{move,complete,fail})).toEqual({status:"completed"});expect(move).toHaveBeenCalledWith(job.path,job.disposalPath);expect(complete).toHaveBeenCalledAfter(move);expect(fail).not.toHaveBeenCalled();});
  it("restores the original path when database finalization fails",async()=>{const move=vi.fn().mockResolvedValue(undefined),complete=vi.fn().mockRejectedValue(new Error("db")),fail=vi.fn().mockResolvedValue(undefined);expect(await runDocumentCleanup(job,{move,complete,fail})).toEqual({status:"restored"});expect(move.mock.calls).toEqual([[job.path,job.disposalPath],[job.disposalPath,job.path]]);expect(fail).toHaveBeenCalledWith(job.jobId,"Cleanup evidence failed; storage move restored.");});
  it("records a retry without finalizing when the first move fails",async()=>{const move=vi.fn().mockRejectedValue(new Error("storage")),complete=vi.fn(),fail=vi.fn().mockResolvedValue(undefined);expect(await runDocumentCleanup(job,{move,complete,fail})).toEqual({status:"retryable"});expect(complete).not.toHaveBeenCalled();expect(fail).toHaveBeenCalled();});
});
