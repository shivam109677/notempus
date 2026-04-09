"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ProfileDialog from "../../../components/ProfileDialog";

export default function ChatProfilePage() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  // Auto-open on mount; if user closes dialog navigate back
  useEffect(() => { setOpen(true); }, []);

  function handleClose(): void {
    setOpen(false);
    router.back();
  }

  return (
    <div className="site-root">
      <header className="site-header">
        <Link href="/" className="brand-link">Notempus</Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/chat">Chat</Link>
          <Link href="/chat/profile">Profile</Link>
          <Link href="/chat/quick-start">Quick start</Link>
          <Link href="/chat/invite">Invite</Link>
        </nav>
      </header>
      <main className="page-wrap">
        <section className="hero-block">
          <p className="hero-kicker">Profile</p>
          <h1>Your chat identity</h1>
          <p>Set your nickname, interests, mood, and more. All data stays on your device.</p>
          {!open && (
            <button className="btn-primary" onClick={() => setOpen(true)}>Edit profile</button>
          )}
        </section>
      </main>
      <ProfileDialog open={open} onClose={handleClose} />
    </div>
  );
}
