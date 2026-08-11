import { readFoundationStatus } from "@/lib/config/foundation-status";

export default function Home() {
  const status = readFoundationStatus();

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Buddy Lending OS</p>
        <h1>A clean foundation for commercial lending.</h1>
        <p className="lede">
          The standalone SaaS migration has begun. Customer data and lending workflows remain disconnected until their security and parity gates pass.
        </p>
      </section>

      <section aria-labelledby="foundation-status" className="panel">
        <div>
          <p className="eyebrow">Controlled build arc</p>
          <h2 id="foundation-status">Foundation status</h2>
        </div>
        <dl>
          <Status label="Supabase" enabled={status.supabaseConfigured} />
          <Status label="Authentication" enabled={status.authEnabled} />
          <Status label="Data reads" enabled={status.readsEnabled} />
          <Status label="Data writes" enabled={status.writesEnabled} />
          <Status label="Documents" enabled={status.documentsEnabled} />
          <Status label="External integrations" enabled={status.integrationsEnabled} />
        </dl>
      </section>
    </main>
  );
}

function Status({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-enabled={enabled}>{enabled ? "Enabled" : "Not connected"}</dd>
    </div>
  );
}
