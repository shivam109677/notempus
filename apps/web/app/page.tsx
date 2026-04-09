import Link from "next/link";

const featureCards = [
  {
    title: "Instant video rooms",
    text: "Jump into a face-to-face call in seconds with smooth one-click controls.",
  },
  {
    title: "Host and earn",
    text: "Hosts can go live, receive sessions, and request payouts from the same app.",
  },
  {
    title: "Trust-first safety",
    text: "Verification, reporting, and moderation checks are built directly into the experience.",
  },
];

const quickSteps = [
  "Open Profile page and set your role, interests, and creator mode.",
  "Use Quick Start page to enter random chat or friend invite mode.",
  "Use Chat room page for call controls, Next, and wallet actions.",
];

export default function Home() {
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
          <p className="hero-kicker">New social video app</p>
          <h1>Meet new people. Go live. Earn from every quality session.</h1>
          <p>
            Notempus combines random video chat with host earnings and safety checks so normal users can talk easily
            and creators can build real income.
          </p>
          <div className="hero-cta-row">
            <Link href="/chat/profile" className="btn-primary">
              Start chatting
            </Link>
            <Link href="/join" className="btn-secondary">
              Join a friend room
            </Link>
            <Link href="/chat/quick-start?role=host" className="btn-secondary">
              Go live as host
            </Link>
          </div>
        </section>

        <section className="feature-grid" aria-label="Product highlights">
          {featureCards.map((card) => (
            <article key={card.title} className="feature-card">
              <h2>{card.title}</h2>
              <p>{card.text}</p>
            </article>
          ))}
        </section>

        <section className="simple-steps" aria-label="How it works">
          <h2>How it works in 3 steps</h2>
          <ol>
            {quickSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="hero-cta-row">
            <Link href="/chat/profile" className="btn-primary">
              Open profile page
            </Link>
            <Link href="/chat/quick-start" className="btn-secondary">
              Open quick start page
            </Link>
            <Link href="/earn" className="btn-secondary">
              Learn host earnings
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
