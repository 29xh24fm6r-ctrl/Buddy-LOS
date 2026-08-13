"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Buddy LOS workspace error", error);
  }, [error]);

  return <main className="workspace-transition">
    <section className="workspace-error-card" role="alert" aria-labelledby="workspace-error-title">
      <p className="eyebrow">Workspace interruption</p>
      <h1 id="workspace-error-title">We couldn’t finish loading this workspace.</h1>
      <p>Your records were not changed. Try the request again, or return to the command center and continue working.</p>
      <div className="workspace-recovery-actions">
        <button type="button" onClick={reset}>Try again</button>
        <Link href="/app">Return to command center</Link>
      </div>
      {error.digest ? <small>Support reference: {error.digest}</small> : null}
    </section>
  </main>;
}
