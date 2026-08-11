"use client";

import { useState } from "react";
import type { DealDocumentVersion } from "@/lib/los/queries";
import type { ReadinessItem } from "@/lib/los/underwriting-readiness";

type DownloadState = { documentId: string; kind: "working" | "error"; message?: string } | null;
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function DealDocumentWorkspace({
  requirements,
  versions,
  downloadsEnabled,
}: {
  requirements: ReadinessItem[];
  versions: DealDocumentVersion[];
  downloadsEnabled: boolean;
}) {
  const [download, setDownload] = useState<DownloadState>(null);
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

  return (
    <section className="operating-panel document-workspace" aria-labelledby="document-workspace-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Due diligence</p><h2 id="document-workspace-title">Document requirements</h2></div>
        <span>{requirements.length} requirements Â· {versions.length} file versions</span>
      </div>
      <p className="workspace-explainer">Requirements are derived and synchronized automatically. There is no separate manual Generate step.</p>
      {requirements.length === 0 && unassigned.length === 0 ? (
        <div className="honest-empty"><strong>No document requirements or files recorded.</strong><p>An empty workspace is not treated as complete.</p></div>
      ) : (
        <div className="document-requirement-list">
          {requirements.map((requirement) => (
            <DocumentRequirementCard
              key={requirement.id}
              requirement={requirement}
              versions={versionsByRequirement.get(requirement.id) ?? []}
              downloadsEnabled={downloadsEnabled}
              download={download}
              onDownload={requestDownload}
            />
          ))}
          {unassigned.length > 0 && (
            <DocumentRequirementCard
              requirement={{ id: "unassigned", label: "Other deal documents", category: "other", status: "received", required: false, dueDate: null }}
              versions={unassigned}
              downloadsEnabled={downloadsEnabled}
              download={download}
              onDownload={requestDownload}
            />
          )}
        </div>
      )}
      {!downloadsEnabled && <p className="document-gate-notice">Downloads are installed but not commissioned. Files remain private until the server gate and live security checks are complete.</p>}
    </section>
  );
}

function DocumentRequirementCard({
  requirement,
  versions,
  downloadsEnabled,
  download,
  onDownload,
}: {
  requirement: ReadinessItem;
  versions: DealDocumentVersion[];
  downloadsEnabled: boolean;
  download: DownloadState;
  onDownload: (version: DealDocumentVersion) => Promise<void>;
}) {
  return (
    <article className="document-requirement-card">
      <header>
        <div><h3>{requirement.label}</h3><p>{requirement.category.replaceAll("_", " ")}{requirement.dueDate ? ` Â· Due ${requirement.dueDate}` : ""}</p></div>
        <span data-status={requirement.status}>{requirement.status.replaceAll("_", " ")}</span>
      </header>
      {versions.length === 0 ? <p className="document-empty">No file version received.</p> : (
        <ul className="document-version-list">
          {versions.map((version) => {
            const clean = version.securityStatus === "clean" && Boolean(version.sha256 && version.scannedAt);
            const working = download?.documentId === version.id && download.kind === "working";
            return (
              <li key={version.id}>
                <div>
                  <strong>{version.fileName}</strong>
                  <small>Version {version.versionNumber} Â· {formatBytes(version.sizeBytes)} Â· Uploaded {formatDate(version.uploadedAt)}</small>
                  <small>{clean ? `Verified ${formatDate(version.scannedAt!)}` : securityLabel(version.securityStatus)}{version.legalHold ? " Â· Legal hold" : ""}</small>
                  {download?.documentId === version.id && download.kind === "error" && <em role="alert">{download.message}</em>}
                </div>
                <div className="document-version-actions">
                  <span data-security={version.securityStatus}>{securityLabel(version.securityStatus)}</span>
                  <button type="button" disabled={!downloadsEnabled || !clean || working} onClick={() => void onDownload(version)}>
                    {working ? "Preparingâ€¦" : "Download"}
                  </button>
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
