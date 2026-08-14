import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const migration=read("supabase/migrations/20260814202530_internal_golden_loan_factory.sql");
const lifecycleMigration=read("supabase/migrations/20260813160000_governed_lending_lifecycle.sql");
const actions=read("src/app/app/deals/[dealId]/lifecycle-actions.ts");
const panel=read("src/components/deals/GoldenLoanCommandPanel.tsx");
const page=read("src/app/app/deals/[dealId]/page.tsx");
const required=[
  [migration,"require_golden_loan_operator","entitled operator boundary"],
  [migration,"certify_credit_memo","memo certification"],
  [migration,"record_credit_committee_vote","committee vote"],
  [migration,"record_human_credit_decision","human credit authority"],
  [migration,"create_credit_condition","credit conditions"],
  [migration,"create_closing_requirement","closing controls"],
  [migration,"golden_authorize_deal_funding","funding admission wrapper"],
  [migration,"golden_board_funded_deal","boarding admission wrapper"],
  [lifecycleMigration,"Open conditions prohibit funding","funding prohibition"],
  [actions,"BUDDY_GOLDEN_LOAN_FACTORY_ENABLED","server-side default-off flag"],
  [actions,"BUDDY_GOLDEN_LOAN_FACTORY_ORGANIZATION_IDS","server-side cohort"],
  [page,"factoryEnabled","read-side cohort"],
  [panel,"Human-controlled lifecycle commands","operator UI"],
  [panel,"No command infers approval","human authority disclosure"],
];
const failures=required.filter(([source,marker])=>!source.includes(marker)).map(([,marker,label])=>`${label}: ${marker}`);
if(migration.includes("grant insert")||migration.includes("grant update")||migration.includes("grant delete"))failures.push("canonical lifecycle tables must remain RPC-write-only");
if(failures.length){console.error("Golden-loan factory verification failed:\n- "+failures.join("\n- "));process.exit(1);}
console.log("Golden-loan factory contract verified: internal cohort, human authority, canonical RPC writes, default-off runtime.");
