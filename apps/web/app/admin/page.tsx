"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type GatewayState = "idle" | "checking" | "online" | "offline";

type ApiResult = {
  title: string;
  status: number;
  payload: unknown;
  at: string;
};

const envGatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim() ?? "";

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

  const host = window.location.hostname || "localhost";
  const protocol = window.location.protocol === "https:" ? "https" : "http";
  const localWeb = window.location.port === "3000" || window.location.port === "3001";
  const fallback = localWeb ? `${protocol}://${host}:4000` : `${protocol}://${host}`;
  return envGatewayUrl && !isLoopback(envGatewayUrl) ? envGatewayUrl : fallback;
}

async function callApi(
  baseUrl: string,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  token?: string,
): Promise<{ status: number; payload: unknown }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response
    .json()
    .catch(() => ({ error: "non_json_response", status: response.status }));

  return { status: response.status, payload };
}

export default function AdminPage() {
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [gatewayState, setGatewayState] = useState<GatewayState>("idle");

  const [adminUserId, setAdminUserId] = useState("00000000-0000-4000-8000-000000000001");
  const [adminToken, setAdminToken] = useState("");

  const [apisPayload, setApisPayload] = useState<unknown>(null);
  const [configPayload, setConfigPayload] = useState<unknown>(null);
  const [reportsPayload, setReportsPayload] = useState<unknown>(null);
  const [logs, setLogs] = useState<ApiResult[]>([]);

  useEffect(() => {
    const base = gatewayDefault();
    setGatewayUrl(base);
    void checkHealth(base);
  }, []);

  function addLog(title: string, status: number, payload: unknown): void {
    setLogs((prev) => [{ title, status, payload, at: new Date().toISOString() }, ...prev].slice(0, 30));
  }

  async function runAction(
    title: string,
    fn: () => Promise<{ status: number; payload: unknown }>,
  ): Promise<{ status: number; payload: unknown } | null> {
    try {
      const result = await fn();
      addLog(title, result.status, result.payload);
      return result;
    } catch (error) {
      addLog(title, 0, { error: error instanceof Error ? error.message : "unknown_error" });
      return null;
    }
  }

  async function checkHealth(base = gatewayUrl): Promise<void> {
    setGatewayState("checking");
    const result = await runAction("Gateway health", () => callApi(base, "/health", "GET"));
    if (!result) {
      setGatewayState("offline");
      return;
    }
    setGatewayState(result.status < 400 ? "online" : "offline");
  }

  async function loadApis(): Promise<void> {
    const result = await runAction("Get API map", () => callApi(gatewayUrl, "/v1/apis", "GET"));
    if (!result) {
      return;
    }
    setApisPayload(result.payload);
  }

  async function loadPublicConfig(): Promise<void> {
    const result = await runAction("Get public config", () => callApi(gatewayUrl, "/v1/config/public", "GET"));
    if (!result) {
      return;
    }
    setConfigPayload(result.payload);
  }

  async function mintAdminToken(): Promise<void> {
    const result = await runAction("Create admin token", () =>
      callApi(gatewayUrl, "/v1/auth/token", "POST", {
        userId: adminUserId,
        role: "admin",
      }),
    );

    if (!result || result.status >= 400) {
      return;
    }

    const payload = result.payload as { token?: string };
    if (payload.token) {
      setAdminToken(payload.token);
    }
  }

  async function loadOpenReports(): Promise<void> {
    if (!adminToken) {
      return;
    }

    const result = await runAction("Load open reports", () =>
      callApi(gatewayUrl, "/v1/reports/open", "GET", undefined, adminToken),
    );
    if (!result) {
      return;
    }
    setReportsPayload(result.payload);
  }

  return (
    <div className="site-root">
      <header className="site-header">
        <Link href="/" className="brand-link">
          Notempus
        </Link>
      </header>
      <main className="admin-wrap">
        <section className="hero-block admin-hero">
          <p className="hero-kicker">Owner console</p>
          <h1>Admin-only endpoint visibility</h1>
          <p>
            This page is protected by server-side basic authentication. Normal users only see the product website.
          </p>
        </section>

        <section className="admin-grid">
          <article className="panel-card">
            <h2>Gateway</h2>
            <label>
              Gateway URL
              <div className="input-with-button">
                <input value={gatewayUrl} onChange={(event) => setGatewayUrl(event.target.value)} />
                <button className="btn-secondary" onClick={() => void checkHealth()}>
                  Check
                </button>
              </div>
            </label>
            <p className="muted-text">State: {gatewayState}</p>

            <div className="inline-actions">
              <button className="btn-secondary" onClick={() => void loadApis()}>
                Load API map
              </button>
              <button className="btn-secondary" onClick={() => void loadPublicConfig()}>
                Load public config
              </button>
            </div>
          </article>

          <article className="panel-card">
            <h2>Admin auth</h2>
            <label>
              Admin user ID
              <input value={adminUserId} onChange={(event) => setAdminUserId(event.target.value)} />
            </label>
            <div className="inline-actions">
              <button className="btn-secondary" onClick={() => void mintAdminToken()}>
                Create admin token
              </button>
              <button className="btn-secondary" onClick={() => void loadOpenReports()} disabled={!adminToken}>
                Load open reports
              </button>
            </div>
            <p className="small-note">Token length: {adminToken.length}</p>
          </article>
        </section>

        <section className="admin-grid">
          <article className="panel-card">
            <h2>API map</h2>
            <pre>{JSON.stringify(apisPayload, null, 2)}</pre>
          </article>

          <article className="panel-card">
            <h2>Public config</h2>
            <pre>{JSON.stringify(configPayload, null, 2)}</pre>
          </article>

          <article className="panel-card">
            <h2>Open reports</h2>
            <pre>{JSON.stringify(reportsPayload, null, 2)}</pre>
          </article>

          <article className="panel-card">
            <h2>Recent actions</h2>
            <div className="activity-list">
              {logs.length === 0 ? (
                <p className="empty-note">No actions yet.</p>
              ) : (
                logs.map((entry, index) => (
                  <article key={`${entry.at}-${index}`} className="api-log-card">
                    <div>
                      <strong>{entry.title}</strong>
                      <span>{new Date(entry.at).toLocaleTimeString()}</span>
                    </div>
                    <p className={entry.status > 0 && entry.status < 400 ? "ok-text" : "error-text"}>status {entry.status}</p>
                  </article>
                ))
              )}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}