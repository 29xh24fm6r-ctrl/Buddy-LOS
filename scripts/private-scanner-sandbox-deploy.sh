#!/usr/bin/env bash
set -euo pipefail

# Creates an authenticated, default-off Cloud Run sandbox. It never enables the
# scanner or changes Buddy LOS/Vercel configuration.
: "${PROJECT_ID:?Set PROJECT_ID (for example: buddy-loan-os)}"
: "${CALLBACK_ORIGIN:?Set CALLBACK_ORIGIN to the exact Buddy LOS HTTPS origin}"

REGION="${REGION:-us-west1}"
REPOSITORY="${REPOSITORY:-buddy-los-private-services}"
SERVICE="${SERVICE:-buddy-los-document-scanner-sandbox}"
RUNTIME_ACCOUNT="${RUNTIME_ACCOUNT:-buddy-los-scanner-runtime}"
INVOKER_ACCOUNT="${INVOKER_ACCOUNT:-buddy-los-scanner-invoker}"
API_SECRET="${API_SECRET:-buddy-los-scanner-api-key}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-buddy-los-scanner-webhook-secret}"

case "$CALLBACK_ORIGIN" in
  https://*/*) echo "CALLBACK_ORIGIN must contain only scheme and host." >&2; exit 2 ;;
  https://*) ;;
  *) echo "CALLBACK_ORIGIN must be HTTPS." >&2; exit 2 ;;
esac

test -f services/document-scanner/Dockerfile || {
  echo "Run this script from the Buddy LOS repository root." >&2
  exit 2
}

if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to deploy from a dirty checkout." >&2
  exit 2
fi

GIT_SHA="$(git rev-parse HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/document-scanner:${GIT_SHA}"
RUNTIME_EMAIL="${RUNTIME_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
INVOKER_EMAIL="${INVOKER_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories describe "$REPOSITORY" --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPOSITORY" --repository-format docker --location "$REGION" --description "Private Buddy LOS services"

ensure_service_account() {
  local name="$1" display="$2"
  gcloud iam service-accounts describe "${name}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 || \
    gcloud iam service-accounts create "$name" --display-name "$display"
}

ensure_secret() {
  local name="$1"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy automatic
    openssl rand -base64 48 | gcloud secrets versions add "$name" --data-file=- >/dev/null
  fi
}

ensure_service_account "$RUNTIME_ACCOUNT" "Buddy LOS private scanner runtime"
ensure_service_account "$INVOKER_ACCOUNT" "Buddy LOS private scanner invoker"
ensure_secret "$API_SECRET"
ensure_secret "$WEBHOOK_SECRET"

for secret in "$API_SECRET" "$WEBHOOK_SECRET"; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member "serviceAccount:${RUNTIME_EMAIL}" \
    --role roles/secretmanager.secretAccessor >/dev/null
done

gcloud builds submit services/document-scanner --tag "$IMAGE"

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --service-account "$RUNTIME_EMAIL" \
  --no-allow-unauthenticated \
  --no-cpu-throttling \
  --cpu 1 \
  --memory 2Gi \
  --concurrency 4 \
  --timeout 60 \
  --min-instances 1 \
  --max-instances 2 \
  --set-env-vars "SCANNER_ENABLED=false,SCANNER_PROVIDER=buddy-private-clamav,SCANNER_CALLBACK_ORIGIN=${CALLBACK_ORIGIN}" \
  --set-secrets "SCANNER_API_KEY=${API_SECRET}:latest,SCANNER_WEBHOOK_SECRET=${WEBHOOK_SECRET}:latest"

gcloud run services add-iam-policy-binding "$SERVICE" \
  --region "$REGION" \
  --member "serviceAccount:${INVOKER_EMAIL}" \
  --role roles/run.invoker >/dev/null

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
IMAGE_DIGEST="$(gcloud artifacts docker images describe "$IMAGE" --format='value(image_summary.digest)')"

printf '\nSandbox deployed disabled.\n'
printf 'Git SHA: %s\n' "$GIT_SHA"
printf 'Image: %s@%s\n' "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/document-scanner" "$IMAGE_DIGEST"
printf 'Service URL: %s\n' "$SERVICE_URL"
printf 'Invoker: %s\n' "$INVOKER_EMAIL"
printf 'Scanner enabled: false\n'

