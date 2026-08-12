# Buddy Underwriter financial-spreading foundation

This slice establishes the canonical contract for normalized financial facts and spreads. Each fact has a stable key, owner entity, accounting period, unit and currency, derivation type, formula lineage when calculated, and document evidence when extracted.

Spreads are derived underwriting artifacts, not editable source-of-record financial statements. They begin in `needs_review`; certification requires a later governed human command. Supersession is explicit so a newer spread cannot silently rewrite historical underwriting evidence.

No extractor, formula engine, global cash-flow calculation, certification command, or production activation is included. Buddy Underwriter source formulas and regression fixtures must be ported behind this boundary in later slices.
