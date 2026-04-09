"use client";

import { KeyboardEvent, useRef } from "react";

interface OtpInputProps {
  value: string;
  onChange: (val: string) => void;
  length?: number;
  disabled?: boolean;
}

export default function OtpInput({ value, onChange, length = 6, disabled = false }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(index: number, char: string): void {
    const digit = char.replace(/\D/g, "").slice(-1);
    const arr = value.padEnd(length, " ").split("");
    arr[index] = digit || " ";
    const next = arr.join("").trimEnd();
    onChange(next);
    if (digit && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Backspace") {
      if (!value[index] || value[index] === " ") {
        refs.current[index - 1]?.focus();
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent): void {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(paste);
    refs.current[Math.min(paste.length, length - 1)]?.focus();
  }

  return (
    <div className="otp-input-row" onPaste={handlePaste}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] && value[i] !== " " ? value[i] : ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          className="otp-digit"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
