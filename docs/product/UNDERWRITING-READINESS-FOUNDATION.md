# Underwriting readiness foundation

This slice adds tenant-bound application checklist and document-requirement records, plus a read-only readiness panel in the deal cockpit.

Readiness is evidence-based: an empty checklist is not complete, waived items are excluded from required counts, every unwaived required item must be satisfied, and any exception blocks review readiness. Unknown or missing information is displayed honestly.

The schema enables RLS, grants authenticated reads only, and relies on the already assignment-scoped deal policy for authorization. It creates no storage bucket and grants no insert, update, delete, upload, review, waiver, or stage-transition authority. Those operations require separate governed commands and private-storage controls.
