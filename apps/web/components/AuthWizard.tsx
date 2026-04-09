"use client";

import { FormEvent, useState } from "react";
import OtpInput from "./OtpInput";

type Step = "method" | "email-password" | "email-otp" | "phone" | "phone-otp" | "address" | "done";

interface AuthWizardProps {
  gatewayUrl: string;
  onComplete: (userId: string, token: string, tier: number) => void;
}

interface StepState {
  email: string;
  password: string;
  captchaToken: string;
  userId: string;
  emailOtp: string;
  phone: string;
  phoneOtp: string;
  line1: string;
  city: string;
  country: string;
  token: string;
  tier: number;
}

export default function AuthWizard({ gatewayUrl, onComplete }: AuthWizardProps) {
  const [step, setStep] = useState<Step>("method");
  const [state, setState] = useState<StepState>({
    email: "", password: "", captchaToken: "dev",
    userId: "", emailOtp: "", phone: "", phoneOtp: "",
    line1: "", city: "", country: "IN",
    token: "", tier: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof StepState>(key: K, value: StepState[K]): void {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function post(path: string, body: unknown, token?: string): Promise<Response> {
    return fetch(`${gatewayUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function submitEmail(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await post("/v1/auth/signup/email", {
        email: state.email,
        password: state.password,
        captchaToken: state.captchaToken || "dev",
      });
      const data = (await res.json()) as { userId?: string; error?: string };
      if (!res.ok || !data.userId) {
        setError((data.error as string) ?? "Signup failed. Try another email.");
        return;
      }
      set("userId", data.userId);
      setStep("email-otp");
    } catch {
      setError("Could not reach server.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmailOtp(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (state.emailOtp.replace(/\s/g, "").length < 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await post("/v1/auth/otp/verify-email", {
        userId: state.userId,
        code: state.emailOtp.replace(/\s/g, ""),
      });
      const data = (await res.json()) as { token?: string; tier?: number };
      if (!res.ok || !data.token) {
        setError("Wrong code. Check your email.");
        return;
      }
      set("token", data.token);
      set("tier", data.tier ?? 1);
      setStep("phone");
    } catch {
      setError("Could not verify.");
    } finally {
      setLoading(false);
    }
  }

  async function sendPhoneOtp(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await post("/v1/auth/otp/send-phone", { userId: state.userId, phone: state.phone }, state.token);
      setStep("phone-otp");
    } catch {
      setError("Could not send SMS.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyPhoneOtp(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (state.phoneOtp.replace(/\s/g, "").length < 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await post("/v1/auth/otp/verify-phone", {
        userId: state.userId,
        code: state.phoneOtp.replace(/\s/g, ""),
      }, state.token);
      const data = (await res.json()) as { token?: string; tier?: number };
      if (!res.ok || !data.token) {
        setError("Wrong code.");
        return;
      }
      set("token", data.token);
      set("tier", data.tier ?? 2);
      setStep("address");
    } catch {
      setError("Could not verify.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAddress(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await post("/v1/auth/address", {
        userId: state.userId,
        line1: state.line1,
        city: state.city,
        country: state.country,
      }, state.token);
      const data = (await res.json()) as { token?: string; tier?: number };
      if (!res.ok) {
        setError("Could not save address.");
        return;
      }
      const finalToken = data.token ?? state.token;
      const finalTier = data.tier ?? 3;
      set("token", finalToken);
      set("tier", finalTier);
      setStep("done");
      onComplete(state.userId, finalToken, finalTier);
    } catch {
      setError("Could not save address.");
    } finally {
      setLoading(false);
    }
  }

  function skipToApp(requiredTier = 1): void {
    // Let user skip optional steps and proceed with what they have
    if (state.token) {
      onComplete(state.userId, state.token, state.tier);
    } else {
      setError("Complete at least email sign-up first.");
    }
    void requiredTier;
  }

  return (
    <div className="auth-wizard">
      {step === "method" && (
        <div className="auth-step">
          <h2>Create your account</h2>
          <p className="muted-text">Sign up to start chatting. Takes 30 seconds.</p>
          <div className="auth-method-list">
            <button className="btn-primary auth-method-btn" onClick={() => setStep("email-password")}>
              ✉️ Continue with Email
            </button>
            <button
              className="btn-secondary auth-method-btn"
              onClick={() => alert("Google Sign-In: integrate @react-oauth/google and call POST /v1/auth/signup/google")}
            >
              🔵 Continue with Google
            </button>
          </div>
        </div>
      )}

      {step === "email-password" && (
        <form className="auth-step" onSubmit={(e) => void submitEmail(e)}>
          <h2>Your email</h2>
          <div className="form-group">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={state.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="auth-password">Password <small>(min 8 chars)</small></label>
            <input
              id="auth-password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={state.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <p className="captcha-note">Protected by hCaptcha</p>
          {error && <p className="error-note">{error}</p>}
          <div className="form-row">
            <button type="button" className="btn-secondary" onClick={() => setStep("method")}>Back</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Sending code…" : "Send verification code"}
            </button>
          </div>
        </form>
      )}

      {step === "email-otp" && (
        <form className="auth-step" onSubmit={(e) => void verifyEmailOtp(e)}>
          <h2>Check your email</h2>
          <p className="muted-text">Enter the 6-digit code we sent to <strong>{state.email}</strong>.</p>
          <OtpInput value={state.emailOtp} onChange={(v) => set("emailOtp", v)} disabled={loading} />
          {error && <p className="error-note">{error}</p>}
          <div className="form-row">
            <button type="button" className="btn-secondary" onClick={() => setStep("email-password")}>Back</button>
            <button type="submit" className="btn-primary" disabled={loading || state.emailOtp.replace(/\s/g, "").length < 6}>
              {loading ? "Verifying…" : "Verify email"}
            </button>
          </div>
        </form>
      )}

      {step === "phone" && (
        <form className="auth-step" onSubmit={(e) => void sendPhoneOtp(e)}>
          <h2>Add your phone <span className="optional-badge">optional</span></h2>
          <p className="muted-text">Required for paid matches and reward claims. You can skip for now.</p>
          <div className="form-group">
            <label htmlFor="auth-phone">Phone number (with country code)</label>
            <input
              id="auth-phone"
              type="tel"
              value={state.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+91 9876543210"
            />
          </div>
          {error && <p className="error-note">{error}</p>}
          <div className="form-row">
            <button type="button" className="btn-secondary" onClick={() => skipToApp()}>Skip for now</button>
            <button type="submit" className="btn-primary" disabled={loading || state.phone.length < 7}>
              {loading ? "Sending…" : "Send SMS code"}
            </button>
          </div>
        </form>
      )}

      {step === "phone-otp" && (
        <form className="auth-step" onSubmit={(e) => void verifyPhoneOtp(e)}>
          <h2>Verify your phone</h2>
          <p className="muted-text">Enter the 6-digit code sent to {state.phone}.</p>
          <OtpInput value={state.phoneOtp} onChange={(v) => set("phoneOtp", v)} disabled={loading} />
          {error && <p className="error-note">{error}</p>}
          <div className="form-row">
            <button type="button" className="btn-secondary" onClick={() => setStep("phone")}>Back</button>
            <button type="submit" className="btn-primary" disabled={loading || state.phoneOtp.replace(/\s/g, "").length < 6}>
              {loading ? "Verifying…" : "Verify phone"}
            </button>
          </div>
        </form>
      )}

      {step === "address" && (
        <form className="auth-step" onSubmit={(e) => void submitAddress(e)}>
          <h2>Your address <span className="optional-badge">for credit purchases</span></h2>
          <p className="muted-text">Required to buy credits. You can skip and add later.</p>
          <div className="form-group">
            <label htmlFor="auth-line1">Address line 1</label>
            <input id="auth-line1" type="text" value={state.line1} onChange={(e) => set("line1", e.target.value)} placeholder="123 Main Street" />
          </div>
          <div className="form-group">
            <label htmlFor="auth-city">City</label>
            <input id="auth-city" type="text" value={state.city} onChange={(e) => set("city", e.target.value)} placeholder="Mumbai" />
          </div>
          <div className="form-group">
            <label htmlFor="auth-country">Country code</label>
            <input id="auth-country" type="text" maxLength={2} value={state.country} onChange={(e) => set("country", e.target.value.toUpperCase())} placeholder="IN" />
          </div>
          {error && <p className="error-note">{error}</p>}
          <div className="form-row">
            <button type="button" className="btn-secondary" onClick={() => skipToApp()}>Skip for now</button>
            <button type="submit" className="btn-primary" disabled={loading || !state.line1 || !state.city}>
              {loading ? "Saving…" : "Save & finish"}
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="auth-step">
          <h2>✅ You're all set!</h2>
          <p className="muted-text">Account Tier {state.tier} — {state.tier >= 2 ? "paid matches unlocked" : "free matches ready"}.</p>
        </div>
      )}
    </div>
  );
}
