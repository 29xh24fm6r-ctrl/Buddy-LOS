# Private ClamAV scanner

The Buddy scanner is a separately deployable, private Cloud Run service. It receives opaque document identifiers, scans bytes with ClamAV, and returns bounded scan evidence through the signed Buddy callback contract. It is not Buddy Underwriter and performs no document intelligence.

## Deployment boundary

- Build `services/document-scanner/Dockerfile` into the private Artifact Registry. The image copies the signature database from ClamAV's preloaded `1.4` image so builds never depend on an unbounded live `freshclam` download.
- Deploy with `--no-allow-unauthenticated`, a dedicated runtime service account, at least 2 GiB memory, `--no-cpu-throttling`, and `--min-instances=1` during certification.
- Grant `roles/run.invoker` only to the dedicated Buddy LOS scanner-invoker service account.
- Store `SCANNER_API_KEY` and `SCANNER_WEBHOOK_SECRET` in Secret Manager.
- Set `SCANNER_CALLBACK_ORIGIN` to the exact Buddy LOS HTTPS origin. Requests cannot redirect callbacks to another host.
- Keep `SCANNER_ENABLED=false` until the exact image digest, ClamAV signature date, IAM policy, and callback target are recorded.

Buddy LOS configures `BUDDY_DOCUMENT_SCANNER_GOOGLE_SERVICE_ACCOUNT_JSON` for the invoker. Google identity travels in `X-Serverless-Authorization`; the provider API credential remains in `Authorization`.

Private Cloud Run also requires one canonical service origin. Set `BUDDY_DOCUMENT_SCANNER_SERVICE_URL` to the service's exact Google-generated `status.url`. Buddy LOS derives both the `/v1/scan` endpoint and the Google identity-token audience from that one HTTPS origin, so the request host and token audience cannot drift apart. The value must not contain a path, query, fragment, username, or password.

`BUDDY_DOCUMENT_SCANNER_AUDIENCE` remains a compatibility alias. If both variables are present, they must normalize to the same origin or scanner commissioning fails closed. `BUDDY_DOCUMENT_SCANNER_ENDPOINT` remains available for non-private providers, but it cannot override the canonical host for the private Cloud Run scanner.

```bash
gcloud run services describe buddy-los-document-scanner-sandbox \
  --project=buddy-loan-os \
  --region=us-west1 \
  --format='value(status.url)'
```

Store that output in Vercel as the server-only `BUDDY_DOCUMENT_SCANNER_SERVICE_URL`. Remove stale alternate `run.app` aliases from `BUDDY_DOCUMENT_SCANNER_ENDPOINT`, or set the endpoint to the same canonical origin plus `/v1/scan` for operator clarity.

Buddy LOS validates the minted token's audience and expiry before sending document bytes. Token creation failures, invalid token claims, and Google Frontend identity rejections are retryable infrastructure failures that do not consume a document's provider-attempt budget. An application-layer 401 is a scanner API-key failure and remains terminal for that attempt. Neither path persists provider response bodies or credentials.

From a clean checkout in Google Cloud Shell, deploy the disabled sandbox with:

```bash
export PROJECT_ID=buddy-loan-os
export CALLBACK_ORIGIN=https://buddylos.com
bash scripts/private-scanner-sandbox-deploy.sh
```

The script creates only the private sandbox, dedicated identities, encrypted secrets, image, and disabled Cloud Run revision. It does not create an invoker key, modify Vercel, enable scanning, or run production documents. Copy `docs/operations/private-scanner-sandbox-evidence.example.json` outside the repository for the live evidence record; never commit populated identifiers or secrets.

## Certification gate

Activate only the internal Buddy organization allowlist and disposable objects. Confirm that a clean PDF becomes downloadable, an EICAR fixture is rejected and never downloadable, duplicates remain idempotent, replay and signature tampering are rejected, oversized input returns 413, and provider outage leaves the document quarantined. Keep production document flags off until evidence is attached to the exact LOS SHA, Vercel deployment, scanner image digest, and Supabase migration head.
