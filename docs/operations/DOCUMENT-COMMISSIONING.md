# Document commissioning

Document handling is installed in source, but installation is not production activation. Commissioning uses four distinct states:

1. **Installed**: required routes, workers, migrations, and the security harness exist in the exact release source.
2. **Configured**: production has server-only Supabase, scanner, callback, and cron settings with valid shapes.
3. **Live-tested**: the exact Vercel deployment and Supabase migration head have passed every test in the evidence record.
4. **Activated**: all document gates are on only after the evidence record contains named, timestamped approval.

Run the fail-closed preflight from the repository root:

```bash
npm run verify:document-commissioning
npm run verify:document-commissioning -- --evidence docs/operations/document-commissioning-evidence.example.json
```

The consolidated internal factory command is an alias with the same evaluator:

```bash
npm run verify:document-lifecycle-factory -- --evidence /secure/path/document-evidence.json
```

See `docs/operations/INTERNAL-DOCUMENT-LIFECYCLE-FACTORY.md` for the exact single-organization evidence, readiness, activation, and rollback contract. `READY_FOR_CONTROLLED_ACTIVATION` means evidence is complete while every feature remains off; it is not a production activation.

Exit code `2` means `HOLD`; this is expected until production commissioning is complete. The command reports variable names and failed gates, never secret values.

## Production sequence

1. Approve a scanner vendor, its data-processing terms, supported file types, latency target, failure behavior, and callback authentication contract.
2. Configure secrets directly in Vercel Production. Keep Preview isolated from production data. Redeploy because Vercel environment changes do not alter existing deployments.
3. Link the repository to the intended Supabase project and compare the remote migration head with the release source. Do not repair or push migration history merely to satisfy this check.
4. Record the exact Git SHA, Vercel deployment ID, and Supabase migration head.
5. Use controlled tenant accounts and disposable private objects to execute every live test in the evidence record. Inspect resulting audit rows and verify secrets are absent from browser bundles, responses, and logs.
6. Have the release owner review the evidence, record approval, then enable gates in a controlled window. Redeploy and repeat the user-path checks.

## Current decision

**HOLD.** On 2026-08-12, the read-only Vercel production inventory contained only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No server-side Supabase secret, scanner configuration, cron secret, document gates, live evidence, or activation approval was observed. No values were changed and no production workflow was activated.
