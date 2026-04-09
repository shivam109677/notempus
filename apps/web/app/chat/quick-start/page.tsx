"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type UserRole = "viewer" | "host";

const storageKeys = {
  role: "notempus.role",
};

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function QuickStartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [role, setRole] = useState<UserRole>("viewer");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const queryRole = searchParams.get("role");
    const storedRole = window.localStorage.getItem(storageKeys.role);

    if (queryRole === "viewer" || queryRole === "host") {
      setRole(queryRole);
      window.localStorage.setItem(storageKeys.role, queryRole);
      return;
    }

    if (storedRole === "viewer" || storedRole === "host") {
      setRole(storedRole);
    }
  }, [searchParams]);

  function startNow(): void {
    window.localStorage.setItem(storageKeys.role, role);
    router.push(`/chat?role=${role}&quick=1`);
  }

  function startHostInviteNow(): void {
    const code = inviteCode.trim();
    if (!uuidRegex.test(code)) {
      setError("Paste a valid invite code.");
      return;
    }

    setError("");
    window.localStorage.setItem(storageKeys.role, "host");
    router.push(`/chat?role=host&invite=${encodeURIComponent(code)}&quick=1`);
  }

  return (
    <div className="site-root">
      <header className="site-header">
        <Link href="/" className="brand-link">
          Notempus
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/chat">Chat</Link>
          <Link href="/chat/profile">Profile</Link>
          <Link href="/chat/quick-start">Quick start</Link>
          <Link href="/chat/invite">Invite</Link>
        </nav>
      </header>

      <main className="page-wrap">
        <section className="hero-block">
          <p className="hero-kicker">Quick start page</p>
          <h1>Start chatting in one tap</h1>
          <p>
            This page handles fast entry. Choose your mode and continue. Hosts can also paste a friend invite code.
          </p>
        </section>

        <section className="feature-grid" aria-label="Quick start choices">
          <article className="feature-card">
            <h2>Mode</h2>
            <label>
              Join as
              <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                <option value="viewer">Viewer</option>
                <option value="host">Host</option>
              </select>
            </label>
            <div className="inline-actions">
              <button className="btn-primary" onClick={startNow}>
                Start now
              </button>
              <Link className="btn-secondary" href="/chat/profile">
                Edit profile first
              </Link>
            </div>
          </article>

          <article className="feature-card">
            <h2>Host friend invite</h2>
            <label>
              Invite code
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="Paste invite code"
              />
            </label>
            {error ? <p className="error-note">{error}</p> : null}
            <div className="inline-actions">
              <button className="btn-secondary" onClick={startHostInviteNow}>
                Join friend room now
              </button>
              <Link className="btn-ghost" href="/join">
                Open full invite page
              </Link>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
