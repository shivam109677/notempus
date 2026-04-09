"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import AuthWizard from "../../components/AuthWizard";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const envGatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim() ?? "";

function gatewayDefault(): string {
  if (typeof window === "undefined") return envGatewayUrl;
  const protocol = window.location.protocol === "https:" ? "https" : "http";
  const host = window.location.hostname || "localhost";
  const localWeb = ["3000", "3001", "3101"].includes(window.location.port);
  const fallback = localWeb ? `${protocol}://${host}:4000` : `${protocol}://${host}`;
  return envGatewayUrl && envGatewayUrl !== "http://localhost:4000" ? envGatewayUrl : fallback;
}

export default function JoinEntryPage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [showSignup, setShowSignup] = useState(false);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);

  useEffect(() => {
    // If user already has a tier-1+ token skip signup form
    const token = localStorage.getItem("notempus.authToken");
    if (token) setAlreadyLoggedIn(true);
  }, []);

  function onInviteSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const code = inviteCode.trim();
    if (!uuidRegex.test(code)) {
      setInviteError("Please paste a valid invite code.");
      return;
    }
    setInviteError("");
    router.push(`/join/${code}`);
  }

  function handleAuthComplete(userId: string, token: string, tier: number): void {
    localStorage.setItem("notempus.authToken", token);
    localStorage.setItem("notempus.authUserId", userId);
    localStorage.setItem("notempus.authTier", String(tier));
    setAlreadyLoggedIn(true);
    setShowSignup(false);
    router.push("/chat");
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
        {!showSignup ? (
          <section className="hero-block">
            <p className="hero-kicker">Welcome to Notempus</p>
            <h1>Chat with real people in seconds</h1>
            <p>Create a free account and start matching by interest, language, and vibe.</p>

            {alreadyLoggedIn ? (
              <div className="hero-cta-row">
                <Link href="/chat" className="btn-primary">Start chatting →</Link>
                <button className="btn-ghost" onClick={() => {
                  localStorage.removeItem("notempus.authToken");
                  setAlreadyLoggedIn(false);
                }}>Sign out</button>
              </div>
            ) : (
              <div className="hero-cta-row">
                <button className="btn-primary" onClick={() => setShowSignup(true)}>
                  Create free account
                </button>
                <Link href="/chat" className="btn-secondary">
                  Try as guest
                </Link>
              </div>
            )}

            <hr className="section-divider" />

            <p className="hero-kicker" style={{ marginTop: "2rem" }}>Have a friend invite?</p>
            <form className="join-form" onSubmit={onInviteSubmit}>
              <label>
                Invite code
                <input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="Paste invite code"
                  aria-label="Invite code"
                />
              </label>
              {inviteError ? <p className="error-note">{inviteError}</p> : null}
              <button className="btn-secondary" type="submit">
                Go to invite room
              </button>
            </form>
          </section>
        ) : (
          <section className="hero-block auth-wizard-page">
            <button className="btn-ghost back-btn" onClick={() => setShowSignup(false)}>← Back</button>
            <AuthWizard gatewayUrl={gatewayDefault()} onComplete={handleAuthComplete} />
          </section>
        )}
      </main>
    </div>
  );
}
