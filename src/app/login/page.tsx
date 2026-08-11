import { redirect } from "next/navigation";
import Link from "next/link";
import { readFoundationStatus } from "@/lib/config/foundation-status";
import { loadAccessContext } from "@/lib/auth/session";
import { signIn } from "./actions";

type LoginPageProps = { searchParams: Promise<{ error?: string }> };

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const status = readFoundationStatus();
  if (status.authEnabled) {
    const context = await loadAccessContext();
    if (context.kind !== "unauthenticated") redirect("/app");
  }
  const { error } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <Link className="brand" href="/">Buddy</Link>
        <p className="eyebrow">Controlled institution access</p>
        <h1 id="sign-in-title">Sign in to your lending workspace.</h1>
        {!status.authEnabled ? (
          <p className="auth-notice">Authentication is installed but remains disabled until institution onboarding is commissioned.</p>
        ) : (
          <form action={signIn} className="auth-form">
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
            {error ? <p className="form-error" role="alert">{messageFor(error)}</p> : null}
            <button type="submit">Sign in</button>
          </form>
        )}
        <p className="auth-help">Accounts are issued by your institution administrator. Public signup is not available.</p>
      </section>
    </main>
  );
}

function messageFor(error: string) {
  if (error === "invalid-input") return "Enter a valid email and password.";
  if (error === "invalid-credentials") return "The email or password was not accepted.";
  return "Authentication is not currently enabled.";
}
