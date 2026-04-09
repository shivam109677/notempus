import Link from "next/link";

const hostSteps = [
  "Create your host profile and verify your identity.",
  "Go live and accept incoming match codes from viewers.",
  "Run paid sessions and request payouts directly in your dashboard.",
];

const hostTips = [
  "Keep a clean background and good lighting to improve trust.",
  "Set a friendly intro so viewers feel comfortable fast.",
  "Use report and block tools quickly if a session turns unsafe.",
];

export default function EarnPage() {
  return (
    <div className="site-root">
      <header className="site-header">
        <Link href="/" className="brand-link">
          Notempus
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/chat">Chat</Link>
          <Link href="/join">Join invite</Link>
          <Link href="/earn">Earn</Link>
          <Link href="/safety">Safety</Link>
        </nav>
      </header>

      <main className="page-wrap">
        <section className="hero-block">
          <p className="hero-kicker">For hosts and streamers</p>
          <h1>Turn your time live into earnings</h1>
          <p>
            Host mode is built for creators. Go live, accept sessions, and receive payouts from the same app without
            juggling multiple tools.
          </p>
          <div className="hero-cta-row">
            <Link href="/chat?role=host" className="btn-primary">
              Open host mode
            </Link>
            <Link href="/safety" className="btn-secondary">
              Read safety guide
            </Link>
          </div>
        </section>

        <section className="feature-grid" aria-label="Host journey">
          <article className="feature-card">
            <h2>Host journey</h2>
            <ol className="number-list">
              {hostSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>

          <article className="feature-card">
            <h2>Best-practice tips</h2>
            <ul className="plain-list">
              {hostTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </article>

          <article className="feature-card">
            <h2>What hosts get</h2>
            <ul className="plain-list">
              <li>Realtime call room with low-latency signaling.</li>
              <li>Built-in payout request flow.</li>
              <li>Verification and moderation support for trust.</li>
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
}