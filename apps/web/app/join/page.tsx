"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function JoinEntryPage() {
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
          <Link href="/earn">Earn</Link>
          <Link href="/safety">Safety</Link>
        </nav>
      </header>

      <main className="page-wrap">
        <section className="hero-block">
          <p className="hero-kicker">Friend invite</p>
          <h1>Join a private room in seconds</h1>
          <p>Paste your friend invite code to jump straight into host acceptance flow.</p>

          <form className="join-form" onSubmit={onSubmit}>
            <label>
              Invite code
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="Paste invite code"
                aria-label="Invite code"
              />
            </label>
            {error ? <p className="error-note">{error}</p> : null}
            <button className="btn-primary" type="submit">
              Continue to join page
            </button>
          </form>

          <div className="hero-cta-row">
            <Link href="/chat" className="btn-secondary">
              Open random chat instead
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
