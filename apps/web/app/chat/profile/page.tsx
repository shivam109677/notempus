"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type UserRole = "viewer" | "host";
type BackendRole = "male" | "female";
type GenderIdentity = "man" | "woman" | "non_binary";
type CreatorProfile = "casual" | "creator";
type MatchMode = "free" | "paid_verified";

type TokenResponse = {
  token?: string;
};

const storageKeys = {
  role: "notempus.role",
  nickname: "notempus.nickname",
  interests: "notempus.interests",
  genderIdentity: "notempus.genderIdentity",
  creatorProfile: "notempus.creatorProfile",
  matchMode: "notempus.matchMode",
  viewerUserId: "notempus.viewerUserId",
  hostUserId: "notempus.hostUserId",
  viewerToken: "notempus.viewerToken",
  hostToken: "notempus.hostToken",
};

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const envGatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim() ?? "";

function createUuid(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function asUuid(value: string | null): string {
  if (value && uuidRegex.test(value)) {
    return value;
  }
  return createUuid();
}

function backendRole(role: UserRole): BackendRole {
  return role === "viewer" ? "male" : "female";
}

function isLoopback(urlValue: string): boolean {
  try {
    const hostname = new URL(urlValue).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function gatewayDefault(): string {
  if (typeof window === "undefined") {
    return envGatewayUrl;
  }

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  const host = window.location.hostname || "localhost";
  const webPort = window.location.port;
  const localWeb = webPort === "3000" || webPort === "3001" || webPort === "3101";
  const fallback = localWeb ? `${protocol}://${host}:4000` : `${protocol}://${host}`;
  return envGatewayUrl && !isLoopback(envGatewayUrl) ? envGatewayUrl : fallback;
}

export default function ChatProfilePage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>("viewer");
  const [nickname, setNickname] = useState("");
  const [interests, setInterests] = useState("");
  const [genderIdentity, setGenderIdentity] = useState<GenderIdentity>("man");
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile>("casual");
  const [matchMode, setMatchMode] = useState<MatchMode>("paid_verified");

  const [viewerUserId, setViewerUserId] = useState("");
  const [hostUserId, setHostUserId] = useState("");
  const [status, setStatus] = useState("Save your profile and continue.");
  const [isMinting, setIsMinting] = useState(false);

  useEffect(() => {
    const persistedRole = window.localStorage.getItem(storageKeys.role);
    const persistedNickname = window.localStorage.getItem(storageKeys.nickname);
    const persistedInterests = window.localStorage.getItem(storageKeys.interests);
    const persistedGender = window.localStorage.getItem(storageKeys.genderIdentity);
    const persistedCreator = window.localStorage.getItem(storageKeys.creatorProfile);
    const persistedMatchMode = window.localStorage.getItem(storageKeys.matchMode);
    const persistedViewer = asUuid(window.localStorage.getItem(storageKeys.viewerUserId));
    const persistedHost = asUuid(window.localStorage.getItem(storageKeys.hostUserId));

    if (persistedRole === "viewer" || persistedRole === "host") {
      setRole(persistedRole);
    }
    if (persistedNickname) {
      setNickname(persistedNickname);
    }
    if (persistedInterests) {
      setInterests(persistedInterests);
    }
    if (persistedGender === "man" || persistedGender === "woman" || persistedGender === "non_binary") {
      setGenderIdentity(persistedGender);
    }
    if (persistedCreator === "casual" || persistedCreator === "creator") {
      setCreatorProfile(persistedCreator);
    }
    if (persistedMatchMode === "free" || persistedMatchMode === "paid_verified") {
      setMatchMode(persistedMatchMode);
    }

    setViewerUserId(persistedViewer);
    setHostUserId(persistedHost);

    window.localStorage.setItem(storageKeys.viewerUserId, persistedViewer);
    window.localStorage.setItem(storageKeys.hostUserId, persistedHost);
  }, []);

  function saveProfileToStorage(): void {
    window.localStorage.setItem(storageKeys.role, role);
    window.localStorage.setItem(storageKeys.nickname, nickname.trim());
    window.localStorage.setItem(storageKeys.interests, interests.trim());
    window.localStorage.setItem(storageKeys.genderIdentity, genderIdentity);
    window.localStorage.setItem(storageKeys.creatorProfile, creatorProfile);
    window.localStorage.setItem(storageKeys.matchMode, matchMode);
    window.localStorage.setItem(storageKeys.viewerUserId, viewerUserId);
    window.localStorage.setItem(storageKeys.hostUserId, hostUserId);
  }

  async function createPass(): Promise<void> {
    const activeRole = role;
    const userId = activeRole === "viewer" ? viewerUserId : hostUserId;

    if (!uuidRegex.test(userId)) {
      setStatus("Profile ID is invalid. Refresh and try again.");
      return;
    }

    setIsMinting(true);
    saveProfileToStorage();

    try {
      const response = await fetch(`${gatewayDefault()}/v1/auth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          role: backendRole(activeRole),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as TokenResponse;
      if (response.status >= 400 || !payload.token) {
        setStatus("Could not create pass right now. Please try again.");
        return;
      }

      if (activeRole === "viewer") {
        window.localStorage.setItem(storageKeys.viewerToken, payload.token);
      } else {
        window.localStorage.setItem(storageKeys.hostToken, payload.token);
      }

      setStatus("Profile saved and pass created. You are ready to continue.");
    } catch {
      setStatus("Could not reach the app server. Check if backend is running.");
    } finally {
      setIsMinting(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    saveProfileToStorage();
    router.push(`/chat/quick-start?role=${role}`);
  }

  return (
    <div className="site-root">
      <header className="site-header">
        <Link href="/" className="brand-link">
          Notempus
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/chat">Chat</Link>
          <Link href="/chat/profile">Profile</Link>
          <Link href="/chat/quick-start">Quick start</Link>
          <Link href="/chat/invite">Invite</Link>
        </nav>
      </header>

      <main className="page-wrap">
        <section className="hero-block">
          <p className="hero-kicker">Profile page</p>
          <h1>Set your chat identity once</h1>
          <p>Choose your role and style here. Then continue to quick start to enter rooms with one tap.</p>
        </section>

        <section className="feature-card">
          <form className="field-grid" onSubmit={onSubmit}>
            <label>
              You are joining as
              <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                <option value="viewer">Viewer</option>
                <option value="host">Host</option>
              </select>
            </label>

            <label>
              Display name
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Your name" />
            </label>

            <label>
              Gender
              <select
                value={genderIdentity}
                onChange={(event) => setGenderIdentity(event.target.value as GenderIdentity)}
              >
                <option value="man">Man</option>
                <option value="woman">Woman</option>
                <option value="non_binary">Non-binary</option>
              </select>
            </label>

            <label>
              Profile type
              <select
                value={creatorProfile}
                onChange={(event) => setCreatorProfile(event.target.value as CreatorProfile)}
              >
                <option value="casual">Normal user</option>
                <option value="creator">Creator or streamer</option>
              </select>
            </label>

            <label>
              Interests
              <input
                value={interests}
                onChange={(event) => setInterests(event.target.value)}
                placeholder="Music, gaming, travel"
              />
            </label>

            <label>
              Match preference
              <select value={matchMode} onChange={(event) => setMatchMode(event.target.value as MatchMode)}>
                <option value="paid_verified">Verified hosts</option>
                <option value="free">Free chat</option>
              </select>
            </label>

            <label>
              Viewer ID
              <input value={viewerUserId} onChange={(event) => setViewerUserId(event.target.value)} />
            </label>

            <label>
              Host ID
              <input value={hostUserId} onChange={(event) => setHostUserId(event.target.value)} />
            </label>

            <div className="inline-actions">
              <button className="btn-primary" type="submit">
                Save and continue
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void createPass()}
                disabled={isMinting}
              >
                {isMinting ? "Creating pass..." : "Create pass now"}
              </button>
              <Link className="btn-ghost" href="/chat">
                Skip to room
              </Link>
            </div>
          </form>

          <p className="small-note">{status}</p>
        </section>
      </main>
    </div>
  );
}
