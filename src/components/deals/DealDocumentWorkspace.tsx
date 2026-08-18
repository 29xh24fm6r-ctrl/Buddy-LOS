"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import type { DealDocumentVersion } from "@/lib/los/queries";
import type { ReadinessItem } from "@/lib/los/underwriting-readiness";
import { DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES } from "../../lib/los/document-upload";
import { parseUploadOutcome, parseUploadPreparation, uploadDocumentToQuarantine } from "../../lib/los/document-upload-client";
import { createClient } from "../../lib/supabase/client";

type DownloadState = { documentId: string; kind: "working" | "error"; message?: string } | null;
type UploadState = { requirementId: string; kind: "working" | "error" | "success"; message: string } | null;
type RecoveryState = { documentId: string; kind: "working" | "error" | "success"; message: string } | null;
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function DealDocumentWorkspace({
  requirements,
  versions,
  dealId,
  downloadsEnabled,
  uploadsEnabled,
  scanRecoveryEnabled,
}: {
  requirements: ReadinessItem[];
  versions: DealDocumentVersion[];
  dealId: string;
  downloadsEnabled: boolean;
  uploadsEnabled: boolean;
  scanRecoveryEnabled: boolean;
}) {
  const router = useRouter();
  const [download, setDownload] = useState<DownloadState>(null);
  const [upload, setUpload] = useState<UploadState>(null);
  const [recovery, setRecovery] = useState<RecoveryState>(null);
  const versionsByRequirement = new Map<string, DealDocumentVersion[]>();
  const unassigned: DealDocumentVersion[] = [];
  for (const version of versions) {
    if (!version.requirementId) {
      unassigned.push(version);
      continue;
    }
    const current = versionsByRequirement.get(version.requirementId) ?? [];
    current.push(version);
    versionsByRequirement.set(version.requirementId, current);
  }

  async function requestDownload(version: DealDocumentVersion) {
    setDownload({ documentId: version.id, kind: "working" });
    try {
      const response = await fetch(`/api/documents/${version.id}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-buddy-request": "document-download" },
        body: JSON.stringify({
          idempotencyKey: `workspace-${version.id}-${crypto.randomUUID()}`,
          reason: "Banker opened document from deal workspace",
        }),
      });
      const result = await response.json() as { signedUrl?: unknown; error?: unknown };
      if (!response.ok || typeof result.signedUrl !== "string")
        throw new Error(typeof result.error === "string" ? result.error : "The document could not be opened.");
      const link = document.createElement("a");
      link.href = result.signedUrl;
      link.download = version.fileName;
      link.rel = "noreferrer";
      link.click();
      setDownload(null);
    } catch (error) {
      setDownload({
        documentId: version.id,
        kind: "error",
        message: error instanceof Error ? error.message : "The document could not be opened.",
      });
    }
  }

  async function requestUpload(requirement: ReadinessItem, currentVersions: DealDocumentVersion[], event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!DOCUMENT_MIME_TYPES.has(file.type) || file.size < 1 || file.size > MAX_DOCUMENT_BYTES) {
      setUpload({ requirementId: requirement.id, kind: "error", message: "Choose a non-empty PDF, Word, Excel, JPEG, or PNG file no larger than 50 MB." });
      return;
    }
    setUpload({ requirementId: requirement.id, kind: "working", message: "Reserving a private document versionâ€¦" });
    const latest = currentVersions.reduce<DealDocumentVersion | null>((best, version) => !best || version.versionNumber > best.versionNumber ? version : best, null);
    try {
      await uploadDocumentToQuarantine({
        prepare: async () => {
          const response = await fetch(`/api/deals/${dealId}/documents/uploads/prepare`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-buddy-request": "document-upload" },
            body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, requirementId: requirement.id === "unassigned" ? null : requirement.id, logicalDocumentId: latest?.logicalDocumentId ?? null, idempotencyKey: `workspace-upload-${crypto.randomUUID()}` }),
          });
          const result = parseUploadPreparation(await response.json());
          if (!response.ok || !result) throw new Error("The upload could not be authorized.");
          setUpload({ requirementId: requirement.id, kind: "working", message: "Uploading directly to private storageâ€¦" });
          return result;
        },
        upload: async (preparation) => {
          const { error } = await createClient().storage.from(preparation.bucket).uploadToSignedUrl(preparation.path, preparation.token, file, { contentType: file.type });
          if (error) throw new Error("The file could not be stored.");
          setUpload({ requirementId: requirement.id, kind: "working", message: "Verifying persisted bytes and entering quarantineâ€¦" });
        },
        finalize: async (documentId) => {
          const response = await fetch(`/api/documents/${documentId}/upload/finalize`, { method: "POST", headers: { "x-buddy-request": "document-upload" } });
          const result = parseUploadOutcome(await response.json());
          if (!response.ok || !result) throw new Error("The stored file could not be verified.");
          return result;
        },
      });
      setUpload({ requirementId: requirement.id, kind: "success", message: "Upload verified and quarantined for malware scanning." });
      router.refresh();
    } catch (error) {
      setUpload({ requirementId: requirement.id, kind: "error", message: error instanceof Error ? error.message : "The document could not be uploaded." });
    }
  }

  async function requestScanRecovery(version: DealDocumentVersion) {
    setRecovery({ documentId: version.id, kind: "working", message: "Retrying the private malware scan…" });
    try {
      const response = await fetch(`/api/documents/${version.id}/scan/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-buddy-request": "document-scan-recovery" },
        body: JSON.stringify({
          idempotencyKey: `workspace-scan-recovery-${version.id}-${crypto.randomUUID()}`,
          reason: "Authorized operator retried a failed document scan from the deal workspace",
        }),
      });
      const result = await response.json() as { error?: unknown };
      if (!response.ok) throw new Error(result.error === "scan_not_recoverable" ? "This scan is no longer eligible for recovery." : "The scan retry could not be started.");
      setRecovery({ documentId: version.id, kind: "success", message: "Recovery accepted. The scan is running again." });
      router.refresh();
    } catch (error) {
      setRecovery({ documentId: version.id, kind: "error", message: error instanceof Error ? error.message : "The scan retry could not be started." });
    }
  }

  return (
    <section className="operating-panel document-workspace" aria-labelledby="document-workspace-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Due diligence</p><h2 id="document-workspace-title">Document requirements</h2></div>
        <span>{requirements.length} requirements Â· {versions.length} file versions</span>
      </div>
      <p className="workspace-explainer">Requirements are derived and synchronized automatically. There is no separate manual Generate step.</p>
      {requirements.length === 0 && unassigned.length === 0 && !uploadsEnabled ? (
        <div className="honest-empty"><strong>No document requirements or files recorded.</strong><p>An empty workspace is not treated as complete.</p></div>
      ) : (
        <div className="document-requirement-list">
          {requirements.map((requirement) => (
            <DocumentRequirementCard
              key={requirement.id}
              requirement={requirement}
              versions={versionsByRequirement.get(requirement.id) ?? []}
              downloadsEnabled={downloadsEnabled}
              uploadsEnabled={uploadsEnabled}
              scanRecoveryEnabled={scanRecoveryEnabled}
              download={download}
              upload={upload}
              recovery={recovery}
              onDownload={requestDownload}
              onUpload={requestUpload}
              onScanRecovery={requestScanRecovery}
            />
          ))}
          {(unassigned.length > 0 || uploadsEnabled) && (
            <DocumentRequirementCard
              requirement={{ id: "unassigned", label: "Other deal documents", category: "other", status: "received", required: false, dueDate: null }}
              versions={unassigned}
              downloadsEnabled={downloadsEnabled}
              uploadsEnabled={uploadsEnabled}
              scanRecoveryEnabled={scanRecoveryEnabled}
              download={download}
              upload={upload}
              recovery={recovery}
              onDownload={requestDownload}
              onUpload={requestUpload}
              onScanRecovery={requestScanRecovery}
            />
          )}
        </div>
      )}
      {!downloadsEnabled && <p className="document-gate-notice">Downloads are installed but not commissioned. Files remain private until the server gate and live security checks are complete.</p>}
      {!uploadsEnabled && <p className="document-gate-notice">Uploads are installed but not commissioned. File controls remain hidden until scanner and live readback checks are complete.</p>}
    </section>
  );
}

function DocumentRequirementCard({
  requirement,
  versions,
  downloadsEnabled,
  uploadsEnabled,
  scanRecoveryEnabled,
  download,
  upload,
  recovery,
  onDownload,
  onUpload,
  onScanRecovery,
}: {
  requirement: ReadinessItem;
  versions: DealDocumentVersion[];
  downloadsEnabled: boolean;
  uploadsEnabled: boolean;
  scanRecoveryEnabled: boolean;
  download: DownloadState;
  upload: UploadState;
  recovery: RecoveryState;
  onDownload: (version: DealDocumentVersion) => Promise<void>;
  onUpload: (requirement: ReadinessItem, versions: DealDocumentVersion[], event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onScanRecovery: (version: DealDocumentVersion) => Promise<void>;
}) {
  return (
    <article className="document-requirement-card">
      <header>
        <div><h3>{requirement.label}</h3><p>{requirement.category.replaceAll("_", " ")}{requirement.dueDate ? ` Â· Due ${requirement.dueDate}` : ""}</p></div>
        <div className="document-requirement-controls"><span data-status={requirement.status}>{requirement.status.replaceAll("_", " ")}</span>{uploadsEnabled ? <label className="document-upload-control">Upload file<input type="file" accept={[...DOCUMENT_MIME_TYPES].join(",")} disabled={upload?.requirementId === requirement.id && upload.kind === "working"} onChange={(event) => void onUpload(requirement, versions, event)} /></label> : null}</div>
      </header>
      {upload?.requirementId === requirement.id ? <p className={`document-upload-outcome ${upload.kind}`} role={upload.kind === "error" ? "alert" : "status"}>{upload.message}</p> : null}
      {versions.length === 0 ? <p className="document-empty">No file version received.</p> : (
        <ul className="document-version-list">
          {versions.map((version) => {
            const clean = version.securityStatus === "clean" && Boolean(version.sha256 && version.scannedAt);
            const working = download?.documentId === version.id && download.kind === "working";
            const recovering = recovery?.documentId === version.id && recovery.kind === "working";
            return (
              <li key={version.id}>
                <div>
                  <strong>{version.fileName}</strong>
                  <small>Version {version.versionNumber} Â· {formatBytes(version.sizeBytes)} Â· Uploaded {formatDate(version.uploadedAt)}</small>
                  <small>{clean ? `Verified ${formatDate(version.scannedAt!)}` : securityLabel(version.securityStatus)}{version.legalHold ? " Â· Legal hold" : ""}</small>
                  {version.scanJob && <small>Scan job: {scanJobLabel(version.scanJob.status)} · Attempt {version.scanJob.attemptCount} of {version.scanJob.maxAttempts}{version.scanJob.lastError ? ` · ${version.scanJob.lastError}` : ""}</small>}
                  {download?.documentId === version.id && download.kind === "error" && <em role="alert">{download.message}</em>}
                  {recovery?.documentId === version.id && <em role={recovery.kind === "error" ? "alert" : "status"}>{recovery.message}</em>}
                </div>
                <div className="document-version-actions">
                  <span data-security={version.securityStatus}>{securityLabel(version.securityStatus)}</span>
                  <button type="button" disabled={!downloadsEnabled || !clean || working} onClick={() => void onDownload(version)}>
                    {working ? "Preparingâ€¦" : "Download"}
                  </button>
                  {scanRecoveryEnabled && version.scanJob?.recoverable && <button type="button" disabled={recovering} onClick={() => void onScanRecovery(version)}>{recovering ? "Retrying…" : "Retry failed scan"}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <footer className="document-write-boundary"><span>Request</span><span>Mark received</span><span>Mark reviewed</span><small>Lifecycle actions pending governed commands</small></footer>
    </article>
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value));
}

function securityLabel(status: string): string {
  return ({ clean: "Scan verified", rejected: "Rejected", scanning: "Scanning", quarantined: "Quarantined", pending_upload: "Upload pending", superseded: "Superseded" } as Record<string, string>)[status] ?? "Unavailable";
}

function scanJobLabel(status: string): string {
  return ({ queued: "Queued", submitting: "Submitting", retryable: "Retry scheduled", awaiting_result: "Awaiting result", completed: "Completed", failed: "Failed" } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}
