import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(path), "utf8");

describe("original Commercial LOS visual baseline contract", () => {
  it("retains the shared application chrome and six-workspace switcher", () => {
    const shell = source("src/components/app/AppShell.tsx");
    const navigation = source("src/components/app/WorkspaceNavigation.tsx");

    for (const landmark of [
      "los-system-bar",
      "app-sidebar",
      "workspace-menu",
      "Workspace switcher",
      "WorkspaceNavigation",
      "sidebar-user",
    ]) expect(shell).toContain(landmark);

    for (const label of [
      "Banker Workspace",
      "CRM Workspace",
      "Team Workspace",
      "Manager Workspace",
      "Portfolio Workspace",
      "Admin Workspace",
    ]) expect(source("src/lib/workspace-surfaces.ts")).toContain(label);

    for (const section of ["My pipeline", "Work queue", "Relationships", "Resources"])
      expect(navigation).toContain(section);
  });

  it("keeps the approved visual baseline keyboard and touch accessible", () => {
    const shell = source("src/components/app/AppShell.tsx");
    const css = source("src/app/globals.css");

    for (const landmark of [
      "Skip to workspace content",
      'id="workspace-content"',
      "tabIndex={-1}",
    ]) expect(shell).toContain(landmark);

    for (const rule of [
      ".skip-link",
      ":where(a,button,input,select,textarea):focus-visible",
      "min-height:44px",
      "prefers-reduced-motion:reduce",
    ]) expect(css).toContain(rule);
  });

  it("collapses the full workspace navigator on compact screens without changing desktop chrome", () => {
    const shell = source("src/components/app/AppShell.tsx");
    const css = source("src/app/globals.css");

    for (const behavior of ["mobile-nav-disclosure", "mobile-nav-content", "Navigation", "WorkspaceNavigation"])
      expect(shell).toContain(behavior);
    for (const rule of [
      ".mobile-nav-disclosure { display:contents; }",
      ".mobile-nav-disclosure>summary { display:none; }",
      ".mobile-nav-disclosure:not([open])>.mobile-nav-content { display:none; }",
      ".mobile-nav-disclosure[open] .mobile-nav-chevron",
    ]) expect(css).toContain(rule);
  });

  it("keeps dense operational screens readable without changing their composition", () => {
    const css = source("src/app/globals.css");

    for (const rule of [
      "UX pass 2: preserve the accepted command-center geometry with a readable type floor",
      "--dense-label-size:8px",
      "--dense-copy-size:9px",
      ".manager-exact-kpis span",
      ".portfolio-exposure-table>a",
      ".deal-exact-identity strong",
      ".crm-diagnostic-strip span",
    ]) expect(css).toContain(rule);
  });

  it("does not present dead-end controls as working actions", () => {
    const actions = source("src/components/app/AppUtilityActions.tsx");
    const crm = source("src/components/crm/BorrowerDirectory.tsx");

    for (const behavior of ["navigator.share", "navigator.clipboard.writeText", "Workspace link copied"])
      expect(actions).toContain(behavior);
    for (const behavior of ["UnavailableWriteButton", "Company creation is not commissioned yet", "crm-more-menu", "More CRM destinations"])
      expect(crm).toContain(behavior);
  });

  it("communicates form requirements and in-progress submissions", () => {
    const submit = source("src/components/app/SubmitButton.tsx");
    const login = source("src/app/login/page.tsx");
    const intake = source("src/app/app/intake/page.tsx");

    for (const behavior of ["useFormStatus", "disabled={isPending}", "aria-disabled={isPending}"])
      expect(submit).toContain(behavior);
    for (const behavior of ["Required fields", "Signing in…", "aria-describedby"])
      expect(login).toContain(behavior);
    for (const behavior of ["Creating governed intake…", "Review the legal name and requested amount", 'inputMode="decimal"'])
      expect(intake).toContain(behavior);
  });

  it("provides branded loading and recoverable workspace error states", () => {
    const loading = source("src/app/app/loading.tsx");
    const error = source("src/app/app/error.tsx");

    for (const behavior of ["Opening your authorized workspace", 'aria-busy="true"', "workspace-loading-grid"])
      expect(loading).toContain(behavior);
    for (const behavior of ["Your records were not changed", "Try again", "Return to command center", "reset"])
      expect(error).toContain(behavior);
  });

  it("retains the screenshot-matched Banker, Team, Manager, and Portfolio compositions", () => {
    const banker = source("src/components/banker/BankerCommandCenter.tsx");
    const roleCenters = source("src/components/institution/RoleCommandCenter.tsx");

    for (const landmark of [
      "banker-kpi-grid",
      "workspace-tabs",
      "What needs you",
      "Pipeline at a glance",
      "Portfolio &amp; workflow health",
      "My Activity Summary",
    ]) expect(banker).toContain(landmark);

    for (const landmark of [
      "Team Ops Queue",
      "team-exact-cockpit",
      "Manager Bloomberg Control Panel",
      "manager-exact-analytics",
      "Portfolio Command Center",
      "portfolio-exact-cockpit",
    ]) expect(roleCenters).toContain(landmark);
  });

  it("retains the screenshot-matched CRM and Deal Cockpit compositions", () => {
    const crm = source("src/components/crm/BorrowerDirectory.tsx");
    const deal = source("src/components/deals/DealCockpit.tsx");

    for (const landmark of [
      "CRM Workspace",
      "crm-search-deck",
      "Where the book needs a human next action",
      "Confirmed relationship interactions",
      "Current authorized CRM result set",
    ]) expect(crm).toContain(landmark);

    for (const landmark of [
      "deal-exact-header",
      "deal-exact-overview",
      "Attention Console",
      "deal-exact-rail",
      "Review readiness",
      "Closing command center",
    ]) expect(deal).toContain(landmark);
  });

  it("retains the compact desktop geometry used by the supplied screenshots", () => {
    const css = source("src/app/globals.css");

    for (const rule of [
      ".los-system-bar { height:38px",
      ".app-shell { grid-template-columns:218px minmax(0,1fr)",
      ".banker-kpi-grid { grid-template-columns:repeat(5,minmax(0,1fr))",
      ".team-exact-cockpit .baseline-kpi-ribbon { grid-template-columns:repeat(10,minmax(0,1fr))",
      ".manager-exact-cockpit",
      ".portfolio-exact-cockpit .baseline-kpi-ribbon { grid-template-columns:repeat(6,minmax(0,1fr))",
      ".deal-exact-header",
      ".crm-search-deck",
    ]) expect(css).toContain(rule);
  });

  it("keeps CRM relationship facts labeled when the desktop table header is hidden", () => {
    const crm = source("src/components/crm/BorrowerDirectory.tsx");
    const css = source("src/app/globals.css");

    for (const behavior of [
      'role="columnheader"',
      'data-label="Company"',
      'data-label="Primary contact"',
      'data-label="Active deals"',
      'data-label="Exposure"',
    ]) expect(crm).toContain(behavior);
    for (const rule of [".directory-row>span::before", "content:attr(data-label)", "overflow-wrap:anywhere"])
      expect(css).toContain(rule);
  });

  it("makes compact tab rails discoverable and identifies the current view", () => {
    const crm = source("src/components/crm/BorrowerDirectory.tsx");
    const banker = source("src/components/banker/BankerCommandCenter.tsx");
    const institutional = source("src/components/institution/InstitutionalCommandCenter.tsx");
    const css = source("src/app/globals.css");

    expect(crm).toContain('aria-current={activeView === tab ? "page" : undefined}');
    expect(banker).toContain('className="active" aria-current="page"');
    expect(institutional).toContain('className="active" aria-current="page"');
    for (const rule of [
      ".workspace-tabs,.deal-workspace-tabs,.crm-tabs",
      "scrollbar-width:auto",
      "touch-action:pan-x",
      ".crm-tabs::-webkit-scrollbar",
      "scroll-snap-align:start",
    ]) expect(css).toContain(rule);
  });
});
