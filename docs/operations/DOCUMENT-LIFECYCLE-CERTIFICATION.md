# Document lifecycle certification harness

This is the single, default-off certification command for the remaining Buddy LOS private-document lifecycle gates. It does not enable uploads, downloads, scanning, cleanup, operations, or the public document surface.

The execution boundary requires exactly one internal organization and all six Buddy LOS document flags to be explicitly `false`. The database portion runs `document_security_recovery.sql` inside its existing rollback transaction. The storage portion creates one uniquely named PDF, verifies its hash, moves it to the disposal prefix, restores it, verifies it again, and removes both possible paths in a `finally` cleanup. The report contains no secret values.

Plan without mutations:

```powershell
npm run certify:document-lifecycle -- --env-file C:\secure\buddy-los.env --evidence C:\secure\document-evidence.json --output C:\secure\document-certification-report.json --organization-id <internal-org-uuid> --vercel-deployment-id <exact-deployment-id> --supabase-migration-head <exact-live-head>
```

Execute the disposable certification only after reviewing that plan:

```powershell
npm run certify:document-lifecycle -- --execute --env-file C:\secure\buddy-los.env --evidence C:\secure\document-evidence.json --output C:\secure\document-certification-report.json --organization-id <internal-org-uuid> --vercel-deployment-id <exact-deployment-id> --supabase-migration-head <exact-live-head>
```

The secure environment must provide the existing commissioning variables plus `SUPABASE_DB_URL`. `psql` must be available. A successful run produces `READY_FOR_CONTROLLED_ACTIVATION`; it never records activation approval or changes feature flags.
