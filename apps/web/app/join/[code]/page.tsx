import Link from "next/link";

type JoinInvitePageProps = {
  params?: Promise<{
    code?: string | string[];
  }>;
};

export default async function JoinInvitePage({ params }: JoinInvitePageProps) {
  const resolvedParams = await params;
  const rawCode = Array.isArray(resolvedParams?.code) ? resolvedParams.code[0] : resolvedParams?.code;
  const inviteCode = decodeURIComponent(rawCode ?? "").trim();

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
          <p className="hero-kicker">Invite ready</p>
          <h1>Join your friend room as host</h1>
          <p>
            This page opens host mode with the invite pre-filled so you can accept fast and connect with one tap.
          </p>

          <div className="code-box">
            <p>Invite code</p>
            <strong>{inviteCode}</strong>
          </div>

          <div className="hero-cta-row">
            <Link href={`/chat?role=host&invite=${encodeURIComponent(inviteCode)}`} className="btn-primary">
              Open host join flow
            </Link>
            <Link href={`/chat?role=host&invite=${encodeURIComponent(inviteCode)}&quick=1`} className="btn-secondary">
              One-tap join now
            </Link>
            <Link href="/chat" className="btn-ghost">
              Open random chat
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
