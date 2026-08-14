# Internal document lifecycle factory

This factory is the single release gate for commissioning Buddy LOS private documents. It joins existing authorities without creating a second entitlement, storage, malware, or release ledger.

## Boundary

- Supabase remains authoritative for tenant membership, document metadata, quarantine state, release state, audit events, and storage paths.
- The private Cloud Run ClamAV service remains a separately authenticated malware verdict provider.
- Vercel remains the Buddy LOS application runtime and feature-gate boundary.
- Only one explicitly recorded internal organization may pass this factory.
- A scanner certification does not activate uploads, downloads, callbacks, cleanup, operations health, or the customer workspace.

## One-PR factory sequence

1. Review the migrations, server routes, storage contract, scanner submission, callback, cleanup, and recovery harness.
2. Configure production-shaped secrets without exposing their values.
3. Bind evidence to the exact Buddy LOS Git SHA, Vercel deployment, Supabase migration head, scanner Git SHA, scanner image digest, private service name, and certification time.
4. Prove the private invoker boundary plus clean and EICAR verdicts.
5. Run the remaining lifecycle tests against disposable objects owned by the internal organization.
6. Keep every document gate off and run:

   ```bash
   npm run verify:document-lifecycle-factory -- --evidence /secure/path/document-evidence.json
   ```

7. A `READY_FOR_CONTROLLED_ACTIVATION` result permits an owner to review an activation change. It is not activation authority.
8. Only after named approval for the same organization may all gates be enabled together and the factory rerun for `GO`.

## Decisions

- `HOLD`: missing, invalid, mismatched, partially enabled, or cross-tenant evidence. Exit code 2.
- `READY_FOR_CONTROLLED_ACTIVATION`: exact evidence is complete, exactly one internal organization is scoped, and every document gate is off. Exit code 0.
- `GO`: the same evidence and scope are present, every document gate is on, and named activation approval matches that organization. Exit code 0.

Partial activation is always a hold. The gates are:

- `NEXT_PUBLIC_BUDDY_DOCUMENTS_ENABLED`
- `BUDDY_DOCUMENT_UPLOADS_ENABLED`
- `BUDDY_DOCUMENT_DOWNLOADS_ENABLED`
- `BUDDY_DOCUMENT_SCANNING_ENABLED`
- `BUDDY_DOCUMENT_CLEANUP_ENABLED`
- `BUDDY_DOCUMENT_OPERATIONS_ENABLED`

The organization allowlist must contain exactly the certified organization in `BUDDY_DOCUMENTS_ORGANIZATION_IDS`.

## Rollback

Set all six gates to `false` and redeploy Buddy LOS. If the scanner is not under active certification, set `SCANNER_ENABLED=false` on the private scanner revision. Do not delete document rows or storage objects during rollback; quarantine, audit, cleanup, retention, and recovery records remain authoritative.

## Current release posture

The factory ships default-off. Merging it does not apply migrations, change Vercel variables, enable the scanner, activate an organization, or process a production document.
