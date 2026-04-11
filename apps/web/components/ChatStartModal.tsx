"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ChatStartModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ChatStartModal({ open, onClose }: ChatStartModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGuest = async () => {
    setIsLoading(true);
    // Set guest session (store in localStorage or sessionStorage for now)
    localStorage.setItem("notempus_guest", "true");
    // Go directly to chat page, skip profile
    router.push("/chat?guest=true");
  };

  const handleLogin = () => {
    router.push("/chat/profile");
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Start chatting</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle">Choose how you want to get started:</p>

          <div className="modal-buttons">
            <button
              className="modal-btn modal-btn-primary"
              onClick={handleGuest}
              disabled={isLoading}
            >
              <span className="modal-btn-icon">👤</span>
              <div className="modal-btn-content">
                <div className="modal-btn-title">Continue as guest</div>
                <div className="modal-btn-desc">Start video chat instantly, no account needed</div>
              </div>
            </button>

            <button
              className="modal-btn modal-btn-secondary"
              onClick={handleLogin}
              disabled={isLoading}
            >
              <span className="modal-btn-icon">🔐</span>
              <div className="modal-btn-content">
                <div className="modal-btn-title">Sign in or create account</div>
                <div className="modal-btn-desc">Unlock earnings, saved preferences, and more</div>
              </div>
            </button>
          </div>

          <p className="modal-footer">
            Both options are safe and verified. Switch accounts anytime.
          </p>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
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

        .modal-content {
          background: linear-gradient(165deg, rgba(12, 31, 44, 0.95), rgba(5, 15, 24, 0.95));
          border: 1px solid rgba(157, 190, 205, 0.28);
          border-radius: 24px;
          width: 100%;
          max-width: 480px;
          padding: 2rem;
          box-shadow: 0 24px 58px rgba(0, 0, 0, 0.5);
          animation: slideUp 300ms ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .modal-header h2 {
          margin: 0;
          font-family: var(--font-display), sans-serif;
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #eff7fb;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #a9c1cc;
          transition: color 200ms ease;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-close:hover {
          color: #eff7fb;
        }

        .modal-subtitle {
          margin: 0 0 1.5rem;
          color: #a9c1cc;
          font-size: 0.95rem;
          text-align: center;
        }

        .modal-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .modal-buttons {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .modal-btn {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.2rem;
          border: 1px solid rgba(157, 190, 205, 0.28);
          border-radius: 16px;
          background: rgba(7, 22, 33, 0.5);
          cursor: pointer;
          transition: all 200ms ease;
          text-align: left;
          font-family: inherit;
          color: inherit;
        }

        .modal-btn:hover:not(:disabled) {
          border-color: rgba(255, 140, 57, 0.5);
          background: rgba(7, 22, 33, 0.8);
          transform: translateY(-2px);
        }

        .modal-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .modal-btn-primary {
          border-color: rgba(255, 140, 57, 0.4);
          background: linear-gradient(130deg, rgba(255, 140, 57, 0.12), rgba(255, 140, 57, 0.04));
        }

        .modal-btn-primary:hover:not(:disabled) {
          border-color: rgba(255, 140, 57, 0.6);
          background: linear-gradient(130deg, rgba(255, 140, 57, 0.18), rgba(255, 140, 57, 0.08));
        }

        .modal-btn-icon {
          font-size: 1.75rem;
          flex-shrink: 0;
        }

        .modal-btn-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .modal-btn-title {
          font-weight: 600;
          color: #eff7fb;
        }

        .modal-btn-desc {
          font-size: 0.85rem;
          color: #a9c1cc;
        }

        .modal-footer {
          margin: 0;
          padding-top: 0.5rem;
          font-size: 0.8rem;
          color: #7a8d98;
          text-align: center;
        }

        @media (max-width: 480px) {
          .modal-content {
            padding: 1.5rem;
          }

          .modal-header h2 {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
