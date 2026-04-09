import Link from "next/link";

const commitments = [
  "Verified host checks to improve trust.",
  "One-click report flow for abuse and suspicious behavior.",
  "Realtime moderation and fraud telemetry monitoring.",
];

const userGuidelines = [
  "Do not share personal contact details in chat.",
  "Leave or report any session that feels unsafe.",
  "Use clear profile names and respectful communication.",
  "For host accounts, complete verification before going live.",
];

export default function SafetyPage() {
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
          <p className="hero-kicker">Safety center</p>
          <h1>Built for safe conversations and trusted creators</h1>
          <p>
            Notempus combines verification, moderation, and reporting tools to help everyone have better and safer
            sessions.
          </p>
          <div className="hero-cta-row">
            <Link href="/chat" className="btn-primary">
              Open chat
            </Link>
            <Link href="/earn" className="btn-secondary">
              Host guidelines
            </Link>
          </div>
        </section>

        <section className="feature-grid" aria-label="Safety details">
          <article className="feature-card">
            <h2>Platform commitments</h2>
            <ul className="plain-list">
              {commitments.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="feature-card">
            <h2>Community guidelines</h2>
            <ul className="plain-list">
              {userGuidelines.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
}