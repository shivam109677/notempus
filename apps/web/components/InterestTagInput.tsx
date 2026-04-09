"use client";

import { KeyboardEvent, useState } from "react";

const SUGGESTIONS = [
  "music", "gaming", "travel", "cooking", "fitness",
  "movies", "books", "art", "technology", "sports",
  "photography", "dance", "yoga", "coding", "fashion",
  "nature", "pets", "anime", "comedy", "startups",
];

interface InterestTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  max?: number;
}

export default function InterestTagInput({ tags, onChange, max = 8 }: InterestTagInputProps) {
  const [input, setInput] = useState("");

  const filtered = SUGGESTIONS.filter(
    (s) => s.includes(input.toLowerCase()) && !tags.includes(s)
  );

  function addTag(tag: string): void {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed) || tags.length >= max) return;
    onChange([...tags, trimmed]);
    setInput("");
  }

  function removeTag(tag: string): void {
    onChange(tags.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="interest-tag-input">
      <div className="tag-list">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => removeTag(tag)}
              className="tag-remove"
            >
              ×
            </button>
          </span>
        ))}
        {tags.length < max && (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tags.length === 0 ? "e.g. music, gaming…" : "add more…"}
            className="tag-input-field"
            list="interest-suggestions"
          />
        )}
      </div>
      {input.length > 0 && filtered.length > 0 && (
        <div className="tag-suggestions">
          {filtered.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              className="tag-suggestion-item"
              onClick={() => addTag(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
