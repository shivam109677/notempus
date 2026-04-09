"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ChatInvitePage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const code = inviteCode.trim();

    if (!uuidRegex.test(code)) {
      setError("Please paste a valid invite code.");
      return;
    }

    setError("");
    router.push(`/join/${code}`);
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
          <p className="hero-kicker">Invite page</p>
          <h1>Join friend rooms without the dashboard clutter</h1>
          <p>
            Paste an invite code to open host acceptance instantly, or go to chat to generate your own room code.
          </p>
        </section>

        <section className="feature-grid" aria-label="Invite actions">
          <article className="feature-card">
            <h2>Join with code</h2>
            <form className="join-form" onSubmit={onSubmit}>
              <label>
                Invite code
                <input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="Paste invite code"
                />
              </label>
              {error ? <p className="error-note">{error}</p> : null}
              <button className="btn-primary" type="submit">
                Continue to host join
              </button>
            </form>
          </article>

          <article className="feature-card">
            <h2>Need a new code?</h2>
            <p className="muted-text">
              Open viewer chat, tap Find someone, and share your generated invite code or room link with your friend.
            </p>
            <div className="inline-actions">
              <Link className="btn-secondary" href="/chat?role=viewer&quick=1">
                Open viewer quick start
              </Link>
              <Link className="btn-ghost" href="/join">
                Use classic join page
              </Link>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
