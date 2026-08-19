import { afterEach,describe,expect,it,vi } from "vitest";
import { logCrmCommandFailure } from "./crm-command-log";

describe("CRM command observability",()=>{
  afterEach(()=>vi.restoreAllMocks());
  it("emits structured failure telemetry without record contents",()=>{
    const error=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    logCrmCommandFailure({command:"update_crm_referral",organizationId:"org",userId:"user",code:"40001",message:"conflict"});
    const payload=JSON.parse(String(error.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({event:"crm.command_failed",command:"update_crm_referral",code:"40001"});
    expect(payload).not.toHaveProperty("notes");
  });
});
