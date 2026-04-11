"use client";

import { useState } from "react";
import Link from "next/link";

interface GuestChatLayoutProps {
  children: React.ReactNode;
  onMenuToggle?: (open: boolean) => void;
}

export default function GuestChatLayout({ children, onMenuToggle }: GuestChatLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuToggle = () => {
    const newState = !menuOpen;
    setMenuOpen(newState);
    onMenuToggle?.(newState);
  };

  return (
    <div className="guest-chat-layout">
      <header className="guest-chat-header">
        <Link href="/" className="guest-brand-link">
          Notempus
        </Link>
        <button
          className="guest-menu-toggle"
          onClick={handleMenuToggle}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </header>

      {menuOpen && (
        <div className="guest-menu-overlay" onClick={() => setMenuOpen(false)} aria-hidden>
          <nav className="guest-menu-drawer">
            <button
              className="guest-menu-close"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
            <Link href="/chat/profile" className="guest-menu-link">
              <span>👤</span> Your Profile
            </Link>
            <Link href="/chat/quick-start" className="guest-menu-link">
              <span>⚡</span> Quick Start
            </Link>
            <Link href="/chat/invite" className="guest-menu-link">
              <span>🔗</span> Invite Friends
            </Link>
            <Link href="/earn" className="guest-menu-link">
              <span>💰</span> Earn Money
            </Link>
            <Link href="/safety" className="guest-menu-link">
              <span>🛡️</span> Safety & Support
            </Link>
            <hr className="guest-menu-divider" />
            <Link href="/" className="guest-menu-link guest-menu-link-primary">
              <span>← </span> Back to Home
            </Link>
          </nav>
        </div>
      )}

      <main className="guest-chat-main">{children}</main>

      <style jsx>{`
        .guest-chat-layout {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: linear-gradient(148deg, #05111b, #0e2331);
          position: relative;
        }

        .guest-chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          border-bottom: 1px solid rgba(157, 190, 205, 0.2);
          background: rgba(7, 22, 33, 0.7);
          backdrop-filter: blur(8px);
          gap: 1.5rem;
          z-index: 100;
        }

        .guest-brand-link {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          font-family: var(--font-display), sans-serif;
          font-size: 1.3rem;
          font-weight: 700;
          color: #ff8c39;
          background: none;
          border: none;
          padding: 0;
          text-decoration: none;
          transition: all 200ms ease;
          letter-spacing: -0.01em;
          flex-shrink: 0;
        }

        .guest-brand-link:hover {
          opacity: 0.8;
          transform: scale(1.02);
        }

        .guest-menu-toggle {
          width: 40px;
          height: 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 5px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          flex-shrink: 0;
        }

        .guest-menu-toggle span {
          width: 24px;
          height: 2px;
          background: #eff7fb;
          border-radius: 1px;
          transition: all 300ms ease;
          display: block;
        }

        .guest-menu-toggle:hover span {
          background: #ff8c39;
        }

        .guest-menu-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 200;
          animation: fadeIn 200ms ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .guest-menu-drawer {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(280px, 100vw);
          background: linear-gradient(180deg, rgba(12, 31, 44, 0.95), rgba(5, 15, 24, 0.95));
          border-left: 1px solid rgba(157, 190, 205, 0.2);
          display: flex;
          flex-direction: column;
          padding: 1.5rem 1rem;
          gap: 0.5rem;
          z-index: 201;
          animation: slideInRight 300ms ease-out;
        }

        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        .guest-menu-close {
          align-self: flex-end;
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #eff7fb;
          cursor: pointer;
          padding: 0.5rem;
          margin-bottom: 0.5rem;
          transition: color 200ms ease;
        }

        .guest-menu-close:hover {
          color: #ff8c39;
        }

        .guest-menu-link {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          background: transparent;
          border: 1px solid transparent;
          color: #a9c1cc;
          text-decoration: none;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
          transition: all 200ms ease;
          font-family: inherit;
        }

        .guest-menu-link:hover {
          background: rgba(255, 140, 57, 0.08);
          border-color: rgba(255, 140, 57, 0.3);
          color: #eff7fb;
          transform: translateX(4px);
        }

        .guest-menu-link span {
          font-size: 1.2rem;
          flex-shrink: 0;
        }

        .guest-menu-link-primary {
          color: #ffd8bc;
          margin-top: 0.5rem;
        }

        .guest-menu-link-primary:hover {
          background: rgba(255, 140, 57, 0.15);
          border-color: rgba(255, 140, 57, 0.4);
        }

        .guest-menu-divider {
          border: none;
          border-top: 1px solid rgba(157, 190, 205, 0.2);
          margin: 0.5rem 0;
        }

        .guest-chat-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: auto;
        }

        @media (max-width: 768px) {
          .guest-chat-header {
            padding: 0.75rem;
          }

          .guest-chat-title {
            font-size: 1.15rem;
          }

          .guest-menu-drawer {
            width: 100%;
            border-left: none;
            border-bottom: 1px solid rgba(157, 190, 205, 0.2);
          }
        }
      `}</style>
    </div>
  );
}
