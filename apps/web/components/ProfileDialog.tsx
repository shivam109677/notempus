"use client";

import { FormEvent, useEffect, useState } from "react";
import InterestTagInput from "./InterestTagInput";

export type UserRole = "viewer" | "host";
export type GenderIdentity = "man" | "woman" | "non_binary";
export type CreatorProfile = "casual" | "creator";
export type MatchMode = "free" | "paid_verified";
export type Mood = "chill" | "curious" | "playful" | "serious";
export type Intent = "chat" | "learn" | "entertain";

export interface ProfileData {
  role: UserRole;
  nickname: string;
  genderIdentity: GenderIdentity;
  creatorProfile: CreatorProfile;
  matchMode: MatchMode;
  interestTags: string[];
  mood: Mood;
  intent: Intent;
  preferredLanguage: string;
  bio: string;
}

export const storageKeys = {
  role: "notempus.role",
  nickname: "notempus.nickname",
  interests: "notempus.interests",
  interestTags: "notempus.interestTags",
  genderIdentity: "notempus.genderIdentity",
  creatorProfile: "notempus.creatorProfile",
  matchMode: "notempus.matchMode",
  viewerUserId: "notempus.viewerUserId",
  hostUserId: "notempus.hostUserId",
  viewerToken: "notempus.viewerToken",
  hostToken: "notempus.hostToken",
  mood: "notempus.mood",
  intent: "notempus.intent",
  preferredLanguage: "notempus.preferredLanguage",
  bio: "notempus.bio",
};

const MOOD_OPTIONS: { value: Mood; label: string; emoji: string }[] = [
  { value: "chill", label: "Chill", emoji: "😌" },
  { value: "curious", label: "Curious", emoji: "🤔" },
  { value: "playful", label: "Playful", emoji: "😄" },
  { value: "serious", label: "Serious", emoji: "🧐" },
];

const INTENT_OPTIONS: { value: Intent; label: string; desc: string }[] = [
  { value: "chat", label: "Just chat", desc: "Casual conversation" },
  { value: "learn", label: "Learn", desc: "Exchange knowledge" },
  { value: "entertain", label: "Entertain", desc: "Have fun & laugh" },
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
];

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (data: ProfileData) => void;
}

function loadProfile(): ProfileData {
  if (typeof window === "undefined") {
    return defaultProfile();
  }
  const ls = window.localStorage;
  const rawTags = ls.getItem(storageKeys.interestTags);
  let interestTags: string[] = [];
  if (rawTags) {
    try {
      interestTags = JSON.parse(rawTags) as string[];
    } catch {
      interestTags = [];
    }
  } else {
    // migrate from old plain-text interests field
    const legacy = ls.getItem(storageKeys.interests) ?? "";
    interestTags = legacy ? legacy.split(",").map((t) => t.trim()).filter(Boolean) : [];
  }

  const role = ls.getItem(storageKeys.role);
  const gender = ls.getItem(storageKeys.genderIdentity);
  const creator = ls.getItem(storageKeys.creatorProfile);
  const mode = ls.getItem(storageKeys.matchMode);
  const mood = ls.getItem(storageKeys.mood);
  const intent = ls.getItem(storageKeys.intent);

  return {
    role: (role === "viewer" || role === "host" ? role : "viewer") as UserRole,
    nickname: ls.getItem(storageKeys.nickname) ?? "",
    genderIdentity: (["man", "woman", "non_binary"].includes(gender ?? "") ? gender : "man") as GenderIdentity,
    creatorProfile: (creator === "casual" || creator === "creator" ? creator : "casual") as CreatorProfile,
    matchMode: (mode === "free" || mode === "paid_verified" ? mode : "paid_verified") as MatchMode,
    interestTags,
    mood: (["chill", "curious", "playful", "serious"].includes(mood ?? "") ? mood : "chill") as Mood,
    intent: (["chat", "learn", "entertain"].includes(intent ?? "") ? intent : "chat") as Intent,
    preferredLanguage: ls.getItem(storageKeys.preferredLanguage) ?? "en",
    bio: ls.getItem(storageKeys.bio) ?? "",
  };
}

function defaultProfile(): ProfileData {
  return {
    role: "viewer",
    nickname: "",
    genderIdentity: "man",
    creatorProfile: "casual",
    matchMode: "paid_verified",
    interestTags: [],
    mood: "chill",
    intent: "chat",
    preferredLanguage: "en",
    bio: "",
  };
}

export function saveProfileToStorage(data: ProfileData): void {
  const ls = window.localStorage;
  ls.setItem(storageKeys.role, data.role);
  ls.setItem(storageKeys.nickname, data.nickname.trim());
  ls.setItem(storageKeys.genderIdentity, data.genderIdentity);
  ls.setItem(storageKeys.creatorProfile, data.creatorProfile);
  ls.setItem(storageKeys.matchMode, data.matchMode);
  ls.setItem(storageKeys.interestTags, JSON.stringify(data.interestTags));
  ls.setItem(storageKeys.interests, data.interestTags.join(", ")); // legacy compat
  ls.setItem(storageKeys.mood, data.mood);
  ls.setItem(storageKeys.intent, data.intent);
  ls.setItem(storageKeys.preferredLanguage, data.preferredLanguage);
  ls.setItem(storageKeys.bio, data.bio.trim());
}

export default function ProfileDialog({ open, onClose, onSaved }: ProfileDialogProps) {
  const [data, setData] = useState<ProfileData>(defaultProfile());

  useEffect(() => {
    if (open) {
      setData(loadProfile());
    }
  }, [open]);

  function set<K extends keyof ProfileData>(key: K, value: ProfileData[K]): void {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!data.nickname.trim()) return;
    saveProfileToStorage(data);
    onSaved?.(data);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Profile setup">
      <div className="dialog-panel profile-dialog">
        <div className="dialog-header">
          <h2>Your Profile</h2>
          <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="profile-form" onSubmit={onSubmit}>
          {/* Role */}
          <fieldset className="form-group">
            <legend>I am a</legend>
            <div className="radio-row">
              {(["viewer", "host"] as UserRole[]).map((r) => (
                <label key={r} className={`radio-card ${data.role === r ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={data.role === r}
                    onChange={() => set("role", r)}
                  />
                  {r === "viewer" ? "👁 Viewer" : "🎥 Host"}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Nickname */}
          <div className="form-group">
            <label htmlFor="nickname">
              Display name <span className="required">*</span>
            </label>
            <input
              id="nickname"
              type="text"
              value={data.nickname}
              onChange={(e) => set("nickname", e.target.value)}
              placeholder="How should people call you?"
              maxLength={30}
              required
            />
          </div>

          {/* Bio */}
          <div className="form-group">
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              value={data.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="Tell people a little about yourself…"
              maxLength={160}
              rows={2}
            />
          </div>

          {/* Gender */}
          <div className="form-group">
            <label htmlFor="gender">Gender identity</label>
            <select
              id="gender"
              value={data.genderIdentity}
              onChange={(e) => set("genderIdentity", e.target.value as GenderIdentity)}
            >
              <option value="man">Man</option>
              <option value="woman">Woman</option>
              <option value="non_binary">Non-binary</option>
            </select>
          </div>

          {/* Language */}
          <div className="form-group">
            <label htmlFor="language">Preferred language</label>
            <select
              id="language"
              value={data.preferredLanguage}
              onChange={(e) => set("preferredLanguage", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mood */}
          <fieldset className="form-group">
            <legend>Mood right now</legend>
            <div className="mood-row">
              {MOOD_OPTIONS.map((m) => (
                <label
                  key={m.value}
                  className={`mood-card ${data.mood === m.value ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="mood"
                    value={m.value}
                    checked={data.mood === m.value}
                    onChange={() => set("mood", m.value)}
                  />
                  <span className="mood-emoji">{m.emoji}</span>
                  <span className="mood-label">{m.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Intent */}
          <fieldset className="form-group">
            <legend>I want to</legend>
            <div className="intent-row">
              {INTENT_OPTIONS.map((i) => (
                <label
                  key={i.value}
                  className={`intent-card ${data.intent === i.value ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="intent"
                    value={i.value}
                    checked={data.intent === i.value}
                    onChange={() => set("intent", i.value)}
                  />
                  <strong>{i.label}</strong>
                  <small>{i.desc}</small>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Interests */}
          <div className="form-group">
            <label>Interests <small>(up to 8)</small></label>
            <InterestTagInput
              tags={data.interestTags}
              onChange={(tags) => set("interestTags", tags)}
            />
          </div>

          {/* Match mode */}
          <div className="form-group">
            <label htmlFor="matchMode">Match mode</label>
            <select
              id="matchMode"
              value={data.matchMode}
              onChange={(e) => set("matchMode", e.target.value as MatchMode)}
            >
              <option value="paid_verified">Paid verified</option>
              <option value="free">Free</option>
            </select>
          </div>

          {/* Creator type (host only) */}
          {data.role === "host" && (
            <div className="form-group">
              <label htmlFor="creatorType">Creator type</label>
              <select
                id="creatorType"
                value={data.creatorProfile}
                onChange={(e) => set("creatorProfile", e.target.value as CreatorProfile)}
              >
                <option value="casual">Casual host</option>
                <option value="creator">Content creator</option>
              </select>
            </div>
          )}

          <div className="dialog-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!data.nickname.trim()}>
              Save profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
