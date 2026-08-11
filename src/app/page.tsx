import { readFoundationStatus } from "@/lib/config/foundation-status";
import Link from "next/link";

export default function Home() {
  const status = readFoundationStatus();

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top">Buddy</a>
        <nav aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#principles">Principles</a>
          <Link className="nav-cta" href="/login">Sign in</Link>
        </nav>
      </header>
      <main id="top">
      <section className="hero">
        <p className="eyebrow">Commercial lending, finally connected</p>
        <h1>From first conversation to funded loan.</h1>
        <p className="lede">
          Buddy gives lenders and borrowers one secure workspace for intake, underwriting, decisions, closing, and portfolio care.
        </p>
        <div className="hero-actions"><a className="primary-action" href="#access">Join the private beta</a><a className="secondary-action" href="#platform">Explore the platform</a></div>
      </section>

      <section id="platform" className="feature-grid" aria-label="Platform capabilities">
        <article><span>01</span><h2>Origination</h2><p>Collect complete borrower and deal information without chasing disconnected forms.</p></article>
        <article><span>02</span><h2>Underwriting</h2><p>Organize financial analysis, conditions, decisions, and supporting evidence in one narrative.</p></article>
        <article><span>03</span><h2>Closing</h2><p>Coordinate requirements, approvals, documents, and funding readiness with a shared source of truth.</p></article>
        <article><span>04</span><h2>Portfolio</h2><p>Carry the relationship forward with covenant tracking, reviews, and proactive servicing.</p></article>
      </section>

      <section id="principles" className="principles"><p className="eyebrow">Built for trust</p><h2>Clear work. Controlled access. Durable decisions.</h2><div><p>Every organization is isolated at the database layer.</p><p>Every material decision keeps its evidence and history.</p><p>Automation assists people; it never silently becomes the authority.</p></div></section>

      <section id="access" className="access-panel"><div><p className="eyebrow">Private beta</p><h2>Build the future of lending with us.</h2></div><p>Secure onboarding is the next release gate. Access will open after tenant-isolation and identity verification are complete.</p></section>

      <section aria-labelledby="foundation-status" className="status-panel">
        <div>
          <p className="eyebrow">Live infrastructure</p>
          <h2 id="foundation-status">Build status</h2>
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
      <footer><span>Buddy LOS</span><span>Purpose-built commercial lending software.</span></footer>
    </>
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
