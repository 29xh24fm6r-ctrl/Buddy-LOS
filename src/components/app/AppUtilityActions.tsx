"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export function ShareWorkspaceButton() {
  const [message, setMessage] = useState("");

  async function shareWorkspace() {
    const shareData = { title: document.title, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        setMessage("Workspace link copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Unable to share this workspace");
    }
  }

  return <span className="utility-action"><button type="button" className="system-share" onClick={() => void shareWorkspace()}>Share⌄</button><span className="sr-status" role="status" aria-live="polite">{message}</span></span>;
}

export function UnavailableWriteButton({ children, explanation }: { children: ReactNode; explanation: string }) {
  const [message, setMessage] = useState("");
  return <span className="utility-action"><button type="button" onClick={() => setMessage(explanation)}>{children}</button>{message && <span className="action-explanation" role="status">{message}</span>}</span>;
}
