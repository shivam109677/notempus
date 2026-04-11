"use client";

import { useState } from "react";
import Link from "next/link";
import ChatStartModal from "@/components/ChatStartModal";

const featureCards = [
  {
    icon: "🎥",
    title: "Instant video rooms",
    text: "Jump into a face-to-face call in seconds with smooth one-click controls.",
    highlight: "Zero setup",
  },
  {
    icon: "💰",
    title: "Host and earn",
    text: "Hosts can go live, receive sessions, and request payouts from the same app.",
    highlight: "Real income",
  },
  {
    icon: "🛡️",
    title: "Trust-first safety",
    text: "Verification, reporting, and moderation checks are built directly into the experience.",
    highlight: "Protected",
  },
];

const quickSteps = [
  {
    num: "1",
    icon: "👤",
    title: "Set Your Profile",
    text: "Choose your role, interests, and creator mode to match with like-minded people.",
  },
  {
    num: "2",
    icon: "🎯",
    title: "Jump Into Chat",
    text: "Enter random chat mode or invite a friend. Connect instantly with verified users.",
  },
  {
    num: "3",
    icon: "🚀",
    title: "Start Earning",
    text: "If you're a host, earn from every session. Manage your wallet and payouts in one place.",
  },
];

export default function Home() {
  const [chatModalOpen, setChatModalOpen] = useState(false);

  return (
    <div className="site-root">
      <ChatStartModal open={chatModalOpen} onClose={() => setChatModalOpen(false)} />

      <header className="site-header">
        <Link href="/" className="brand-link">
          <span className="brand-emoji">🎥</span> Notempus
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/chat" className="nav-link">Chat</Link>
          <Link href="/join" className="nav-link">Invite</Link>
          <Link href="/earn" className="nav-link">Earn</Link>
          <Link href="/safety" className="nav-link">Safety</Link>
        </nav>
      </header>

      <main className="page-wrap">
        <section className="hero-block">
          <div className="hero-content">
            <div className="hero-badge">✨ Meet anyone. Anytime.</div>
            <h1 className="hero-title">
              Connect with real people.
              <span className="gradient-text"> Go live. Earn.</span>
            </h1>
            <p className="hero-desc">
              Notempus is your all-in-one platform for random video chat, live streaming, and creator earnings. 
              Meet new people, build connections, and earn real income all in a safe, verified environment.
            </p>
            <div className="hero-stats">
              <div className="stat-item">
                <span className="stat-number">1000+</span>
                <span className="stat-label">Active users</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">25K+</span>
                <span className="stat-label">Sessions daily</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">$100K+</span>
                <span className="stat-label">Paid to hosts</span>
              </div>
            </div>
            <div className="hero-cta-row">
              <button
                className="btn-primary btn-large"
                onClick={() => setChatModalOpen(true)}
              >
                <span className="btn-icon">▶</span> Start chatting
              </button>
              <Link href="/chat/quick-start?role=host" className="btn-secondary btn-large">
                <span className="btn-icon">🚀</span> Go live as host
              </Link>
            </div>
            <p className="hero-subtext">No credit card required • Instant verification</p>
          </div>
          <div className="hero-visual">
            <div className="floating-card card-1">
              <div className="card-icon">🎥</div>
              <p>Video chat</p>
            </div>
            <div className="floating-card card-2">
              <div className="card-icon">💬</div>
              <p>Messages</p>
            </div>
            <div className="floating-card card-3">
              <div className="card-icon">💰</div>
              <p>Earnings</p>
            </div>
          </div>
        </section>

        <section className="feature-grid" aria-label="Product highlights">
          {featureCards.map((card) => (
            <article key={card.title} className="feature-card">
              <div className="feature-icon">{card.icon}</div>
              <div className="feature-badge">{card.highlight}</div>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
            </article>
          ))}
        </section>

        <section className="steps-section" aria-label="How it works">
          <div className="steps-header">
            <h2>Get started in 3 simple steps</h2>
            <p>From zero to first video chat in minutes</p>
          </div>
          <div className="steps-grid">
            {quickSteps.map((step) => (
              <div key={step.num} className="step-card">
                <div className="step-number">{step.num}</div>
                <div className="step-icon">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <div className="step-connector"></div>
              </div>
            ))}
          </div>
          <div className="steps-cta">
            <Link href="/chat/profile" className="btn-primary">
              Create profile
            </Link>
            <Link href="/chat/quick-start" className="btn-outline">
              Try quick start
            </Link>
          </div>
        </section>

        <section className="cta-section">
          <h2>Ready to connect?</h2>
          <p>Join thousands of users chatting, connecting, and earning every day.</p>
          <Link href="/join" className="btn-primary btn-large">
            <span className="btn-icon">→</span> Enter the chat
          </Link>
        </section>
      </main>
    </div>
  );
}
