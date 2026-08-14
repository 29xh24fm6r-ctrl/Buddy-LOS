# Private ClamAV scanner

The Buddy scanner is a separately deployable, private Cloud Run service. It receives opaque document identifiers, scans bytes with ClamAV, and returns bounded scan evidence through the signed Buddy callback contract. It is not Buddy Underwriter and performs no document intelligence.

## Deployment boundary

- Build `services/document-scanner/Dockerfile` into the private Artifact Registry.
- Deploy with `--no-allow-unauthenticated`, a dedicated runtime service account, at least 2 GiB memory, `--no-cpu-throttling`, and `--min-instances=1` during certification.
- Grant `roles/run.invoker` only to the dedicated Buddy LOS scanner-invoker service account.
- Store `SCANNER_API_KEY` and `SCANNER_WEBHOOK_SECRET` in Secret Manager.
- Set `SCANNER_CALLBACK_ORIGIN` to the exact Buddy LOS HTTPS origin. Requests cannot redirect callbacks to another host.
- Keep `SCANNER_ENABLED=false` until the exact image digest, ClamAV signature date, IAM policy, and callback target are recorded.

Buddy LOS configures `BUDDY_DOCUMENT_SCANNER_GOOGLE_SERVICE_ACCOUNT_JSON` for the invoker. Google identity travels in `X-Serverless-Authorization`; the provider API credential remains in `Authorization`.

## Certification gate

Activate only the internal Buddy organization allowlist and disposable objects. Confirm that a clean PDF becomes downloadable, an EICAR fixture is rejected and never downloadable, duplicates remain idempotent, replay and signature tampering are rejected, oversized input returns 413, and provider outage leaves the document quarantined. Keep production document flags off until evidence is attached to the exact LOS SHA, Vercel deployment, scanner image digest, and Supabase migration head.
