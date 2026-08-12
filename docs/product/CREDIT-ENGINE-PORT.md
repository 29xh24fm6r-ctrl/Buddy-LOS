# Buddy deterministic credit-engine port

This factory slice ports Buddy's credit-safety definitions into a pure, versioned engine: canonical DSCR is NCADS divided by total existing plus proposed annual debt service; global DSCR combines business and sponsor cash flow; proposed-loan coverage remains separately labeled; collateral LTV uses lendable rather than gross value; guarantor support is net of contingent liabilities; Stress C applies simultaneous rate and revenue shocks; and PD/LGD risk is deterministic and policy-versioned.

The canonical cash-flow waterfall is also ported in dependency order: reported EBITDA, quality-of-earnings adjustments, owner-benefit adjustments, normalized taxes and maintenance capital expenditures, NCADS, cash after debt service, and DSCR. Its output includes formula-input lineage instead of unlabeled scalar results.

Every assessment remains advisory and requires human review. Policy exceptions are explicit records and cannot be silently waived. AI may later narrate these results but cannot set a grade, alter a formula, resolve an exception, or approve credit.
