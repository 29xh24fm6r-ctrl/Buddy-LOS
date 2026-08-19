import { describe,expect,it } from "vitest";
import { activityKinds,borrowerKinds,canOperateCore,contactKinds,dateTimeValue,decimalValue,enumValue,formatInTimeZone,optionalText,requiredText,safeTimeZone,uuidValue,validContactValue } from "./core-operations";
describe("core operation input boundary",()=>{
  it.each(["owner","administrator","lender"] as const)("permits %s",(role)=>expect(canOperateCore(role)).toBe(true));
  it.each(["underwriter","closer","viewer"] as const)("denies %s",(role)=>expect(canOperateCore(role)).toBe(false));
  it("validates bounded command input",()=>{const f=new FormData();f.set("name"," valid ");f.set("empty","");f.set("kind","business");f.set("uuid","9e3f6b9b-7116-41e7-8be4-a0ff97d4bcd7");f.set("date","2026-08-13T12:00");expect(requiredText(f,"name",2,20)).toBe("valid");expect(optionalText(f,"empty",20)).toBe("");expect(enumValue(f,"kind",borrowerKinds)).toBe("business");expect(uuidValue(f,"uuid")).toBeTruthy();expect(dateTimeValue(f,"date")).toContain("2026-08-13");});
  it("publishes only supported enums",()=>{expect(contactKinds).toEqual(["email","phone","address","website","other"]);expect(activityKinds).toContain("meeting");});
  it("validates typed contact values",()=>{expect(validContactValue("email","banker@example.com")).toBe(true);expect(validContactValue("email","not-an-email")).toBe(false);expect(validContactValue("website","https://example.com")).toBe(true);expect(validContactValue("website","javascript:alert(1)")).toBe(false);expect(validContactValue("phone","+1 (212) 555-0100")).toBe(true);});
  it("parses optional decimal command input",()=>{const f=new FormData();f.set("amount","51.5");expect(decimalValue(f,"amount")).toBe(51.5);expect(decimalValue(new FormData(),"amount",true)).toBeNull();});
  it("fails safe for invalid institution timezones and dates",()=>{expect(safeTimeZone("America/New_York")).toBe("America/New_York");expect(safeTimeZone("not/a-zone")).toBe("UTC");expect(formatInTimeZone("bad-date","not/a-zone")).toBe("Invalid date");});
});
