"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import ProfileDialog from "../../components/ProfileDialog";
import GuestChatLayout from "../../components/GuestChatLayout";
import { storageKeys as profileStorageKeys } from "../../components/ProfileDialog";

type UserRole = "viewer" | "host";
type BackendRole = "male" | "female";
type GenderIdentity = "man" | "woman" | "non_binary";
type CreatorProfile = "casual" | "creator";
type MatchMode = "free" | "paid_verified";
type GatewayState = "idle" | "checking" | "online" | "offline";
type WsState = "idle" | "connecting" | "open" | "closed" | "error";
type MediaState = "idle" | "requesting" | "ready" | "error";
type CallState = "idle" | "searching" | "waiting" | "ringing" | "connecting" | "live" | "ended";

type Endpoints = {
  gateway: string;
  signaling: string;
};

type ApiLog = {
  title: string;
  status: number;
  payload: unknown;
  at: string;
};

type ChatMessage = {
  from: "me" | "peer" | "system";
  text: string;
  at: string;
};

type PublicConfigResponse = {
  webrtc?: {
    stunUrl?: string;
    turnUrl?: string;
    turnUsername?: string;
    turnPassword?: string;
  };
  signaling?: {
    wsUrl?: string;
  };
};

type SignalMessage = {
  event?: string;
  payload?: {
    reason?: string;
    message?: string;
    senderName?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
  fromUserId?: string;
  at?: string;
};

const envGatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim() ?? "";
const envSignalingUrl = process.env.NEXT_PUBLIC_SIGNALING_WS_URL?.trim() ?? "";

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

const fallbackIceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isLoopback(urlValue: string): boolean {
  try {
    const hostname = new URL(urlValue).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function lanEndpoints(): Endpoints {
  if (typeof window === "undefined") {
    return { gateway: envGatewayUrl, signaling: envSignalingUrl };
  }

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname || "localhost";
  const webPort = window.location.port;
  const localWeb = webPort === "3000" || webPort === "3001" || webPort === "3101";

  const gatewayFallback = localWeb ? `${protocol}://${host}:4000` : `${protocol}://${host}`;
  const signalingFallback = localWeb ? `${wsProtocol}://${host}:4003/ws` : `${wsProtocol}://${host}/ws`;

  return {
    gateway: envGatewayUrl && !isLoopback(envGatewayUrl) ? envGatewayUrl : gatewayFallback,
    signaling: envSignalingUrl && !isLoopback(envSignalingUrl) ? envSignalingUrl : signalingFallback,
  };
}

function makeIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function backendRole(role: UserRole): BackendRole {
  return role === "viewer" ? "male" : "female";
}

export default function ChatPage(): JSX.Element {
  const searchParams = useSearchParams();

  const [role, setRole] = useState<UserRole>("viewer");
  const [nickname, setNickname] = useState("");
  const [interests, setInterests] = useState("");
  const [genderIdentity, setGenderIdentity] = useState<GenderIdentity>("man");
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile>("casual");
  const [matchMode, setMatchMode] = useState<MatchMode>("paid_verified");

  const [viewerUserId, setViewerUserId] = useState("");
  const [hostUserId, setHostUserId] = useState("");
  const [viewerToken, setViewerToken] = useState("");
  const [hostToken, setHostToken] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [requestCode, setRequestCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [endpoints, setEndpoints] = useState<Endpoints>({ gateway: envGatewayUrl, signaling: envSignalingUrl });
  const [iceServers, setIceServers] = useState<RTCIceServer[]>(fallbackIceServers);

  const [gatewayState, setGatewayState] = useState<GatewayState>("idle");
  const [wsState, setWsState] = useState<WsState>("idle");
  const [mediaState, setMediaState] = useState<MediaState>("idle");
  const [callState, setCallState] = useState<CallState>("idle");
  const [statusText, setStatusText] = useState("Ready to start");
  const [mediaError, setMediaError] = useState("");
  const [apiError, setApiError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [isSetupReady, setIsSetupReady] = useState(false);

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [topupAmount, setTopupAmount] = useState(50);
  const [payoutAmount, setPayoutAmount] = useState(100);
  const [verificationStatus, setVerificationStatus] = useState("not_started");

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [feedEvents, setFeedEvents] = useState<string[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [isQuickStarting, setIsQuickStarting] = useState(false);

  // Camera & safe-mode state
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [blurActive, setBlurActive] = useState(false);
  const [safeModePending, setSafeModePending] = useState(false);
  const [localSafeModeAccepted, setLocalSafeModeAccepted] = useState(false);
  const [remoteSafeModeAccepted, setRemoteSafeModeAccepted] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const matchPollingRef = useRef<number | null>(null);
  const hostOfferPollingRef = useRef<number | null>(null);
  const billingStartedRef = useRef(false);
  const autoQuickStartRef = useRef(false);
  const autoAcceptOfferRef = useRef(false);
  const preparingMatchRef = useRef(false);
  const requestCodeRef = useRef("");
  const inviteCodeRef = useRef("");
  const reconnectAttemptsRef = useRef(0);
  const tokenExpiryRef = useRef<number | null>(null);

  const activeUserId = role === "viewer" ? viewerUserId : hostUserId;
  const oppositeUserId = role === "viewer" ? hostUserId : viewerUserId;
  const activeToken = role === "viewer" ? viewerToken : hostToken;
  const queryRole = searchParams.get("role");
  const inviteFromUrl = searchParams.get("invite")?.trim() ?? "";
  const quickStartFromUrl = searchParams.get("quick") === "1";
  const isGuest = searchParams.get("guest") === "true";

  const callStateLabel =
    callState === "searching"
      ? "Searching"
      : callState === "waiting"
        ? "Live and waiting"
        : callState === "ringing"
          ? "Incoming"
          : callState === "connecting"
            ? "Connecting"
            : callState === "live"
              ? "Live"
              : callState === "ended"
                ? "Ended"
                : "Idle";
  const inviteRoomPath = requestCode ? `/join/${requestCode}` : "";
  const quickStartPath = role === "host" ? "/chat/quick-start?role=host" : "/chat/quick-start?role=viewer";

  const latestApi = useMemo(() => apiLogs[0], [apiLogs]);

  useEffect(() => {
    if (queryRole === "viewer" || queryRole === "host") {
      setRole(queryRole);
    }

    if (inviteFromUrl && uuidRegex.test(inviteFromUrl)) {
      setRole("host");
      setInviteCode(inviteFromUrl);
      setSessionId(inviteFromUrl);
      setStatusText("Friend invite detected. Tap quick start to accept and join.");
    }
  }, [queryRole, inviteFromUrl]);

  useEffect(() => {
    const defaults = lanEndpoints();
    const urlParams = new URLSearchParams(window.location.search);
    const roleFromLocation = urlParams.get("role");
    const inviteFromLocation = urlParams.get("invite")?.trim() ?? "";
    const persistedRole = window.localStorage.getItem(storageKeys.role);
    const persistedNickname = window.localStorage.getItem(storageKeys.nickname);
    const persistedInterests = window.localStorage.getItem(storageKeys.interests);
    const persistedGender = window.localStorage.getItem(storageKeys.genderIdentity);
    const persistedCreatorProfile = window.localStorage.getItem(storageKeys.creatorProfile);
    const persistedMatchMode = window.localStorage.getItem(storageKeys.matchMode);
    const persistedViewer = asUuid(window.localStorage.getItem(storageKeys.viewerUserId));
    const persistedHost = asUuid(window.localStorage.getItem(storageKeys.hostUserId));
    const persistedViewerToken = window.localStorage.getItem(storageKeys.viewerToken) ?? "";
    const persistedHostToken = window.localStorage.getItem(storageKeys.hostToken) ?? "";

    if (persistedRole === "viewer" || persistedRole === "host") {
      setRole(persistedRole);
    }
    if (roleFromLocation === "viewer" || roleFromLocation === "host") {
      setRole(roleFromLocation);
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
    if (persistedCreatorProfile === "casual" || persistedCreatorProfile === "creator") {
      setCreatorProfile(persistedCreatorProfile);
    }
    if (persistedMatchMode === "free" || persistedMatchMode === "paid_verified") {
      setMatchMode(persistedMatchMode);
    }

    setViewerUserId(persistedViewer);
    setHostUserId(persistedHost);
    setViewerToken(persistedViewerToken);
    setHostToken(persistedHostToken);
    if (inviteFromLocation && uuidRegex.test(inviteFromLocation)) {
      setRole("host");
      setInviteCode(inviteFromLocation);
      setSessionId(inviteFromLocation);
    } else {
      setSessionId(createUuid());
    }
    setEndpoints(defaults);

    window.localStorage.setItem(storageKeys.viewerUserId, persistedViewer);
    window.localStorage.setItem(storageKeys.hostUserId, persistedHost);

    // Auto-open profile dialog for first-time visitors
    if (!persistedNickname) {
      setProfileDialogOpen(true);
    }

    void checkGatewayHealth(defaults.gateway);
    void loadPublicConfig(defaults.gateway);
    if (inviteFromLocation && uuidRegex.test(inviteFromLocation)) {
      setStatusText("Friend invite detected. Tap quick start to accept and join.");
    } else {
      setStatusText("Profile loaded. You can start whenever you are ready.");
    }
    setIsSetupReady(true);

    return () => {
      clearMatchPolling();
      clearHostOfferPolling();
      disconnectSignaling();
      closePeer();
      stopLocalMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSetupReady) {
      return;
    }
    window.localStorage.setItem(storageKeys.role, role);
  }, [role, isSetupReady]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.nickname, nickname);
  }, [nickname]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.interests, interests);
  }, [interests]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.genderIdentity, genderIdentity);
  }, [genderIdentity]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.creatorProfile, creatorProfile);
  }, [creatorProfile]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.matchMode, matchMode);
  }, [matchMode]);

  useEffect(() => {
    if (viewerUserId) {
      window.localStorage.setItem(storageKeys.viewerUserId, viewerUserId);
    }
  }, [viewerUserId]);

  useEffect(() => {
    if (hostUserId) {
      window.localStorage.setItem(storageKeys.hostUserId, hostUserId);
    }
  }, [hostUserId]);

  useEffect(() => {
    if (viewerToken) {
      window.localStorage.setItem(storageKeys.viewerToken, viewerToken);
    } else {
      window.localStorage.removeItem(storageKeys.viewerToken);
    }
  }, [viewerToken]);

  useEffect(() => {
    if (hostToken) {
      window.localStorage.setItem(storageKeys.hostToken, hostToken);
    } else {
      window.localStorage.removeItem(storageKeys.hostToken);
    }
  }, [hostToken]);

  useEffect(() => {
    requestCodeRef.current = requestCode;
  }, [requestCode]);

  useEffect(() => {
    inviteCodeRef.current = inviteCode;
  }, [inviteCode]);

  function addApiLog(title: string, status: number, payload: unknown): void {
    setApiLogs((prev) => [{ title, status, payload, at: new Date().toISOString() }, ...prev].slice(0, 40));
  }

  function addEvent(value: string): void {
    setFeedEvents((prev) => [`${new Date().toLocaleTimeString()} · ${value}`, ...prev].slice(0, 40));
  }

  function addChatMessage(message: ChatMessage): void {
    setChatMessages((prev) => [...prev.slice(-49), message]);
  }

  async function callGateway(
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

    // 30-second timeout to prevent infinite hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const payload = await response
        .json()
        .catch(() => ({ error: "non_json_response", status: response.status }));

      return { status: response.status, payload };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("API request timeout after 30 seconds");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function runAction(
    title: string,
    fn: () => Promise<{ status: number; payload: unknown }>,
  ): Promise<{ status: number; payload: unknown } | null> {
    try {
      const result = await fn();
      addApiLog(title, result.status, result.payload);
      
      // Show error if API returns 5xx or client error
      if (result.status >= 400) {
        const errorMsg = typeof result.payload === 'object' && result.payload !== null 
          ? (result.payload as any).message || `API error (${result.status})`
          : `API error (${result.status})`;
        setApiError(`${title} failed: ${errorMsg}`);
      } else {
        setApiError(""); // Clear errors on success
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "unknown_error";
      addApiLog(title, 0, { error: errorMessage });
      
      // Show connection-related errors differently
      if (errorMessage.includes("fetch") || errorMessage.includes("network")) {
        setConnectionError(`Connection failed: ${title}`);
      } else {
        setApiError(`${title} failed: ${errorMessage}`);
      }
      return null;
    }
  }

  async function checkGatewayHealth(baseOverride?: string): Promise<void> {
    const base = baseOverride ?? endpoints.gateway;
    setGatewayState("checking");
    const result = await runAction("Gateway health", () => callGateway(base, "/health", "GET"));
    if (!result) {
      setGatewayState("offline");
      return;
    }
    setGatewayState(result.status < 400 ? "online" : "offline");
  }

  async function loadPublicConfig(baseOverride?: string): Promise<void> {
    const base = baseOverride ?? endpoints.gateway;
    const result = await runAction("Load realtime config", () => callGateway(base, "/v1/config/public", "GET"));
    if (!result || result.status >= 400) {
      return;
    }

    const payload = result.payload as PublicConfigResponse;
    const servers: RTCIceServer[] = [];
    if (payload.webrtc?.stunUrl) {
      servers.push({ urls: payload.webrtc.stunUrl });
    }
    if (payload.webrtc?.turnUrl) {
      const turnServer: RTCIceServer = { urls: payload.webrtc.turnUrl };
      if (payload.webrtc.turnUsername && payload.webrtc.turnPassword) {
        turnServer.username = payload.webrtc.turnUsername;
        turnServer.credential = payload.webrtc.turnPassword;
      }
      servers.push(turnServer);
    }

    setIceServers(servers.length > 0 ? servers : fallbackIceServers);
    if (payload.signaling?.wsUrl) {
      setEndpoints((prev) => ({ ...prev, signaling: payload.signaling?.wsUrl ?? prev.signaling }));
    }
  }

  function setRoleToken(targetRole: UserRole, token: string): void {
    if (targetRole === "viewer") {
      setViewerToken(token);
    } else {
      setHostToken(token);
    }
  }

  function userIdForRole(targetRole: UserRole): string {
    return targetRole === "viewer" ? viewerUserId : hostUserId;
  }

  async function mintToken(targetRole: UserRole): Promise<string | null> {
    const userId = userIdForRole(targetRole);
    if (!uuidRegex.test(userId)) {
      addApiLog("Create pass", 0, { error: "invalid_user_id" });
      return null;
    }

    const result = await runAction(`Create pass for ${targetRole}`, () =>
      callGateway(endpoints.gateway, "/v1/auth/token", "POST", {
        userId,
        role: backendRole(targetRole),
      }),
    );

    if (!result || result.status >= 400) {
      return null;
    }

    const payload = result.payload as { token?: string; expiresIn?: number };
    if (!payload.token) {
      return null;
    }

    // Track token expiry (default 1 hour if not provided)
    const expiresInMs = (payload.expiresIn || 3600) * 1000;
    tokenExpiryRef.current = Date.now() + expiresInMs;

    setRoleToken(targetRole, payload.token);
    return payload.token;
  }

  async function ensureToken(targetRole: UserRole = role): Promise<string | null> {
    const cached = targetRole === "viewer" ? viewerToken : hostToken;
    
    // Check if token needs refresh (if expires within 5 minutes)
    const now = Date.now();
    if (tokenExpiryRef.current && now > tokenExpiryRef.current - 5 * 60 * 1000) {
      // Token expiring soon, force refresh
      return mintToken(targetRole);
    }
    
    if (cached) {
      return cached;
    }
    return mintToken(targetRole);
  }

  async function authCall(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    targetRole: UserRole = role,
  ): Promise<{ status: number; payload: unknown }> {
    const token = await ensureToken(targetRole);
    if (!token) {
      throw new Error("missing_auth_token");
    }
    return callGateway(endpoints.gateway, path, method, body, token);
  }

  function clearMatchPolling(): void {
    if (matchPollingRef.current) {
      window.clearInterval(matchPollingRef.current);
      matchPollingRef.current = null;
    }
  }

  function clearHostOfferPolling(): void {
    if (hostOfferPollingRef.current) {
      window.clearInterval(hostOfferPollingRef.current);
      hostOfferPollingRef.current = null;
    }
  }

  function stopLocalMedia(): void {
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setMediaState("idle");
  }

  async function startLocalMedia(): Promise<MediaStream | null> {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    setMediaState("requesting");
    setMediaError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("media_not_supported");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (pcRef.current) {
        for (const track of stream.getTracks()) {
          pcRef.current.addTrack(track, stream);
        }
      }

      setMediaState("ready");
      addEvent("Camera and microphone connected.");
      return stream;
    } catch (error) {
      const message = error instanceof Error ? error.message : "media_error";
      setMediaError(message);
      setMediaState("error");
      addEvent("Could not access camera or microphone.");
      return null;
    }
  }

  function closePeer(): void {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    remoteStreamRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  function disconnectSignaling(): void {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsState("closed");
  }

  async function sendSignal(
    event: string,
    payload?: { reason?: string; message?: string; senderName?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit },
    toUserId?: string,
  ): Promise<boolean> {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addEvent("Signaling is not connected yet.");
      return false;
    }

    wsRef.current.send(JSON.stringify({ event, payload, toUserId }));
    return true;
  }

  async function startBillingSession(): Promise<void> {
    if (billingStartedRef.current || !sessionId || !viewerUserId || !hostUserId) {
      return;
    }

    const result = await runAction("Start session billing", () =>
      authCall(
        "/v1/sessions/start",
        "POST",
        {
          sessionId,
          maleUserId: viewerUserId,
          femaleUserId: hostUserId,
          connectedAt: new Date().toISOString(),
          ratePerMinutePaise: 1000,
        },
        "viewer",
      ),
    );

    if (result && result.status < 400) {
      billingStartedRef.current = true;
      addEvent("Session billing started.");
    }
  }

  async function stopBillingSession(): Promise<void> {
    if (!billingStartedRef.current || !sessionId) {
      return;
    }

    await runAction("Stop session billing", () =>
      authCall(
        "/v1/sessions/stop",
        "POST",
        {
          sessionId,
          reason: "normal",
        },
        "viewer",
      ),
    );

    billingStartedRef.current = false;
  }

  function ensurePeer(): RTCPeerConnection {
    if (pcRef.current && pcRef.current.signalingState !== "closed") {
      return pcRef.current;
    }

    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      void sendSignal("webrtc.ice", { candidate: event.candidate.toJSON() });
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) {
        return;
      }

      remoteStreamRef.current = stream;
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("live");
        setStatusText("You are now live in chat.");
        addEvent("Peer connected.");
        if (!billingStartedRef.current) {
          void startBillingSession();
        }
      }

      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setCallState("ended");
        setStatusText("Connection ended.");
      }
    };

    return pc;
  }

  async function handleSignalingMessage(raw: string): Promise<void> {
    const parsed = (() => {
      try {
        return JSON.parse(raw) as SignalMessage;
      } catch {
        return null;
      }
    })();

    if (!parsed?.event) {
      return;
    }

    if (parsed.event === "session.heartbeat" && parsed.payload?.reason === "chat") {
      if (parsed.payload.message) {
        addChatMessage({
          from: "peer",
          text: parsed.payload.message,
          at: parsed.at ?? new Date().toISOString(),
        });
      }
      return;
    }

    try {
      if (parsed.event === "webrtc.offer") {
        setCallState("ringing");
        setStatusText("Incoming call. Connecting...");

        const stream = await startLocalMedia();
        if (!stream || !parsed.payload?.sdp) {
          return;
        }

        const pc = ensurePeer();
        await pc.setRemoteDescription(new RTCSessionDescription(parsed.payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal("webrtc.answer", { sdp: answer }, parsed.fromUserId);
        setCallState("connecting");
        return;
      }

      if (parsed.event === "webrtc.answer" && parsed.payload?.sdp) {
        const pc = ensurePeer();
        await pc.setRemoteDescription(new RTCSessionDescription(parsed.payload.sdp));
        setCallState("connecting");
        return;
      }

      if (parsed.event === "webrtc.ice" && parsed.payload?.candidate) {
        const pc = ensurePeer();
        await pc.addIceCandidate(new RTCIceCandidate(parsed.payload.candidate));
        return;
      }

      if (parsed.event === "session.terminate") {
        setCallState("ended");
        setStatusText("The other person ended the chat.");
        closePeer();
      }

      if (parsed.event === "safe_mode.request") {
        setBlurActive(true);
        setSafeModePending(true);
        setLocalSafeModeAccepted(false);
        setRemoteSafeModeAccepted(false);
        addEvent("Peer requested safe mode.");
      }

      if (parsed.event === "safe_mode.accept") {
        setRemoteSafeModeAccepted(true);
        // Lift blur only when both sides accepted
        setLocalSafeModeAccepted((local) => {
          if (local) {
            setSafeModePending(false);
            setBlurActive(false);
            addEvent("Both accepted — safe mode lifted.");
          }
          return local;
        });
      }

      if (parsed.event === "safe_mode.reject") {
        addEvent("Peer rejected safe mode — ending call.");
        void endChat();
      }
    } catch (error) {
      addApiLog("Process signaling", 0, { error: error instanceof Error ? error.message : "signaling_error" });
    }
  }

  async function connectSignaling(forceSessionId?: string): Promise<boolean> {
    const token = await ensureToken(role);
    if (!token || !activeUserId) {
      setStatusText("Create your pass first.");
      return false;
    }

    const resolvedSessionId = forceSessionId ?? sessionId;
    if (!resolvedSessionId) {
      setStatusText("Session is not ready yet.");
      return false;
    }

    let wsUrl: URL;
    try {
      wsUrl = new URL(endpoints.signaling);
    } catch {
      setWsState("error");
      addEvent("Signaling URL is invalid.");
      return false;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    wsUrl.searchParams.set("sessionId", resolvedSessionId);
    wsUrl.searchParams.set("userId", activeUserId);
    wsUrl.searchParams.set("token", token);

    setWsState("connecting");

    // Exponential backoff for reconnection attempts
    const reconnectAttempts = reconnectAttemptsRef.current || 0;
    const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // 1s, 2s, 4s, 8s, 16s, 30s, 30s...

    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      let settled = false;
      const done = (ok: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (ok) {
          reconnectAttemptsRef.current = 0; // Reset backoff on successful connection
        } else {
          reconnectAttemptsRef.current = (reconnectAttemptsRef.current || 0) + 1; // Increment for next attempt
        }
        resolve(ok);
      };

      ws.onopen = () => {
        setWsState("open");
        addEvent("Realtime channel connected.");
        done(true);
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          void handleSignalingMessage(event.data);
        }
      };

      ws.onerror = () => {
        setWsState("error");
        setConnectionError("WebSocket connection error. Check your network connection.");
        addEvent("Realtime connection failed.");
        done(false);
      };

      ws.onclose = () => {
        setWsState("closed");
        setConnectionError("Connection closed. Please refresh and try again.");
        done(false);
      };

      // 10-second connection timeout
      window.setTimeout(() => {
        done(ws.readyState === WebSocket.OPEN);
      }, 10000);
    });
  }

  async function ensureSignaling(): Promise<boolean> {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return true;
    }
    return connectSignaling();
  }

  async function startCall(): Promise<void> {
    if (role === "viewer" && !requestCode) {
      setStatusText("Tap Find someone first.");
      return;
    }

    if (role === "host" && !requestCode && !inviteCode) {
      setStatusText("Wait for an incoming request or use an invite code.");
      return;
    }

    const connected = await ensureSignaling();
    if (!connected) {
      return;
    }

    const stream = await startLocalMedia();
    if (!stream) {
      return;
    }

    const pc = ensurePeer();
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    await sendSignal("webrtc.offer", { sdp: offer });
    setCallState("connecting");
    setStatusText("Calling now...");
  }

  async function prepareMatchedRoom(requestId: string, autoStartCall: boolean): Promise<void> {
    if (!requestId || preparingMatchRef.current) {
      return;
    }

    preparingMatchRef.current = true;
    try {
      setSessionId(requestId);
      setRequestCode(requestId);

      const connected = await connectSignaling(requestId);
      if (!connected) {
        setStatusText("Matched. Tap Connect room to continue.");
        return;
      }

      addEvent("Realtime room is ready.");

      if (!autoStartCall) {
        setStatusText("Matched. Tap Start call when ready.");
        return;
      }

      await startCall();
    } finally {
      preparingMatchRef.current = false;
    }
  }

  async function endChat(): Promise<void> {
    await sendSignal("session.terminate", { reason: "user_ended" });
    await stopBillingSession();
    clearMatchPolling();
    clearHostOfferPolling();
    closePeer();
    disconnectSignaling();
    stopLocalMedia();
    setCallState("ended");
    setStatusText("Chat ended.");
  }

  async function pollMatchStatus(requestId: string): Promise<void> {
    const result = await runAction("Check match", () => authCall(`/v1/match/${requestId}`, "GET", undefined, "viewer"));
    if (!result || result.status >= 400) {
      return;
    }

    const payload = result.payload as {
      status?: string;
      offered_female_user_id?: string;
      female_user_id?: string;
      offered_female_user_id_alias?: string;
    };

    if (payload.status === "matched") {
      clearMatchPolling();
      setStatusText("Match accepted. Connecting room...");
      setCallState("connecting");
      addEvent("A host accepted your request.");
      await prepareMatchedRoom(requestId, true);
      return;
    }

    if (payload.status === "offered") {
      setStatusText("A host is reviewing your request.");
      return;
    }

    if (payload.status === "cancelled") {
      clearMatchPolling();
      setCallState("idle");
      setStatusText("Match request canceled.");
    }
  }

  async function pollHostOffers(): Promise<void> {
    if (role !== "host" || !hostUserId) {
      return;
    }

    try {
      const result = await authCall(`/v1/female/offers/${hostUserId}`, "GET", undefined, "host");
      if (result.status >= 400) {
        return;
      }

      const payload = result.payload as {
        offers?: Array<{
          requestId?: string;
        }>;
      };

      const nextOffer = payload.offers?.find((item) => typeof item.requestId === "string")?.requestId ?? "";
      if (!nextOffer || !uuidRegex.test(nextOffer)) {
        return;
      }

      if (requestCodeRef.current === nextOffer && inviteCodeRef.current === nextOffer) {
        return;
      }

      setRequestCode(nextOffer);
      setInviteCode(nextOffer);
      setSessionId(nextOffer);
      setStatusText("Incoming request ready. Tap Accept friend invite.");
      addEvent("Incoming match request received.");

      if (quickStartFromUrl && !autoAcceptOfferRef.current) {
        autoAcceptOfferRef.current = true;
        await acceptInviteAndStart(nextOffer);
      }
    } catch {
      // Keep polling silent to avoid noisy UI errors in normal use.
    }
  }

  function startMatchPolling(requestId: string): void {
    clearMatchPolling();
    matchPollingRef.current = window.setInterval(() => {
      void pollMatchStatus(requestId);
    }, 2200);
  }

  function startHostOfferPolling(): void {
    clearHostOfferPolling();
    hostOfferPollingRef.current = window.setInterval(() => {
      void pollHostOffers();
    }, 2200);
  }

  async function startMatching(): Promise<void> {
    if (!activeUserId) {
      return;
    }

    if (role === "host") {
      clearMatchPolling();
      const result = await runAction("Go live", () =>
        authCall(
          "/v1/female/available",
          "POST",
          {
            femaleUserId: hostUserId,
          },
          "host",
        ),
      );

      if (result && result.status < 400) {
        setCallState("waiting");
        setStatusText("You are live. Waiting for the next request...");
        addEvent("Host profile is now available for matching.");
        void pollHostOffers();
        startHostOfferPolling();
      }
      return;
    }

    clearHostOfferPolling();

    const result = await runAction("Find match", () =>
      authCall(
        "/v1/match/join",
        "POST",
        {
          userId: viewerUserId,
          mode: matchMode,
          preferredLanguage: window.localStorage.getItem(profileStorageKeys.preferredLanguage) ?? "en",
          interestTags: (() => {
            try {
              return JSON.parse(window.localStorage.getItem(profileStorageKeys.interestTags) ?? "[]") as string[];
            } catch { return []; }
          })(),
          mood: window.localStorage.getItem(profileStorageKeys.mood) ?? "chill",
          intent: window.localStorage.getItem(profileStorageKeys.intent) ?? "chat",
        },
        "viewer",
      ),
    );

    if (!result || result.status >= 400) {
      return;
    }

    const payload = result.payload as { requestId?: string };
    if (!payload.requestId) {
      return;
    }

    setRequestCode(payload.requestId);
    setInviteCode(payload.requestId);
    setSessionId(payload.requestId);
    setCallState("searching");
    setStatusText("Looking for a host now...");
    startMatchPolling(payload.requestId);
  }

  async function acceptInviteCode(codeOverride?: string): Promise<void> {
    if (role !== "host") {
      return;
    }

    const resolvedInviteCode = (codeOverride ?? inviteCode).trim();
    if (!resolvedInviteCode || !uuidRegex.test(resolvedInviteCode)) {
      setStatusText("Enter a valid match code from the viewer.");
      return;
    }

    const result = await runAction("Accept match code", () =>
      authCall(
        "/v1/match/respond",
        "POST",
        {
          requestId: resolvedInviteCode,
          femaleUserId: hostUserId,
          response: "accept",
        },
        "host",
      ),
    );

    if (!result || result.status >= 400) {
      return;
    }

    setInviteCode(resolvedInviteCode);
    setCallState("connecting");
    setStatusText("Match accepted. Preparing room...");
    await prepareMatchedRoom(resolvedInviteCode, false);
  }

  async function acceptInviteAndStart(codeOverride?: string): Promise<void> {
    await acceptInviteCode(codeOverride);
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    await startCall();
  }

  async function oneTapQuickStart(): Promise<void> {
    if (isQuickStarting) {
      return;
    }

    setIsQuickStarting(true);
    setStatusText("Setting up your profile and room...");

    try {
      const token = await ensureToken(role);
      if (!token) {
        setStatusText("Could not prepare your pass. Try again.");
        return;
      }

      await startLocalMedia();

      if (role === "host") {
        if (inviteCode && uuidRegex.test(inviteCode)) {
          await acceptInviteAndStart(inviteCode);
          setStatusText("Invite accepted. Joining now...");
        } else {
          await startMatching();
        }
      } else {
        await startMatching();
      }
    } finally {
      setIsQuickStarting(false);
    }
  }

  async function nextChat(): Promise<void> {
    await endChat();
    clearMatchPolling();
    clearHostOfferPolling();
    await startLocalMedia();
    autoAcceptOfferRef.current = false;

    if (role === "viewer" && requestCode) {
      await runAction("Leave previous queue", () =>
        authCall(
          "/v1/match/leave",
          "POST",
          {
            requestId: requestCode,
          },
          "viewer",
        ),
      );
    }

    const freshSession = createUuid();
    setSessionId(freshSession);
    setRequestCode("");
    setInviteCode("");
    setCopiedCode(false);
    setChatMessages([]);
    setCallState("idle");
    setStatusText("Starting a fresh conversation...");
    await startMatching();
  }

  async function refreshWallet(): Promise<void> {
    if (!activeUserId) {
      return;
    }

    const result = await runAction("Load wallet", () => authCall(`/v1/wallet/${activeUserId}`, "GET"));
    if (!result || result.status >= 400) {
      return;
    }

    const payload = result.payload as { balance_paise?: number };
    if (typeof payload.balance_paise === "number") {
      setWalletBalance(payload.balance_paise);
    }
  }

  async function topupWallet(): Promise<void> {
    if (role !== "viewer") {
      setStatusText("Top-up is available in viewer mode.");
      return;
    }

    await runAction("Top up wallet", () =>
      authCall(
        "/v1/wallet/topup",
        "POST",
        {
          userId: viewerUserId,
          amountPaise: Math.max(100, Math.round(topupAmount * 100)),
          idempotencyKey: makeIdempotencyKey("topup"),
        },
        "viewer",
      ),
    );

    await refreshWallet();
  }

  async function requestPayout(): Promise<void> {
    if (role !== "host") {
      setStatusText("Payouts are available in host mode.");
      return;
    }

    await runAction("Request payout", () =>
      authCall(
        "/v1/payouts/request",
        "POST",
        {
          femaleUserId: hostUserId,
          amountPaise: Math.max(100, Math.round(payoutAmount * 100)),
          idempotencyKey: makeIdempotencyKey("payout"),
        },
        "host",
      ),
    );
  }

  async function runVerification(): Promise<void> {
    if (role !== "host") {
      setStatusText("Verification is available in host mode.");
      return;
    }

    const selfieResult = await runAction("Upload selfie", () =>
      authCall(
        "/v1/verification/selfie",
        "POST",
        {
          userId: hostUserId,
          selfieUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1",
        },
        "host",
      ),
    );

    if (!selfieResult || selfieResult.status >= 400) {
      setVerificationStatus("selfie_failed");
      return;
    }

    const liveResult = await runAction("Run live check", () =>
      authCall(
        "/v1/verification/live-check",
        "POST",
        {
          userId: hostUserId,
          sessionId,
          liveCaptureUrl: "https://example.com/live.mp4",
          blinkDetected: true,
          headMovementDetected: true,
          faceMatchScore: 0.94,
          livenessScore: 0.95,
        },
        "host",
      ),
    );

    if (!liveResult || liveResult.status >= 400) {
      setVerificationStatus("pending_review");
      return;
    }

    const payload = liveResult.payload as { status?: string };
    setVerificationStatus(payload.status ?? "pending");
  }

  async function reportUser(): Promise<void> {
    if (!oppositeUserId || !uuidRegex.test(oppositeUserId)) {
      setStatusText("No valid other user to report yet.");
      return;
    }

    await runAction("Report user", () =>
      authCall("/v1/reports", "POST", {
        reporterUserId: activeUserId,
        reportedUserId: oppositeUserId,
        sessionId,
        reason: "suspicious_behavior",
        details: "Submitted from in-call report button",
      }),
    );
  }

  async function sendSafetyTelemetry(): Promise<void> {
    if (!oppositeUserId || !uuidRegex.test(oppositeUserId)) {
      setStatusText("No valid target for telemetry yet.");
      return;
    }

    await runAction("Send safety telemetry", () =>
      authCall("/v1/fraud/telemetry", "POST", {
        userId: oppositeUserId,
        sessionId,
        replayLikelihood: 0.15,
        staticImageProbability: 0.1,
        accountSwitches24h: 1,
        actionRatePerMinute: 28,
      }),
    );
  }

  function toggleCamera(): void {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newEnabled = !cameraEnabled;
    stream.getVideoTracks().forEach((t) => { t.enabled = newEnabled; });
    setCameraEnabled(newEnabled);
    addEvent(newEnabled ? "Camera turned on." : "Camera turned off.");
  }

  function activateSafeMode(): void {
    setBlurActive(true);
    setSafeModePending(true);
    setLocalSafeModeAccepted(false);
    setRemoteSafeModeAccepted(false);
    void sendSignal("safe_mode.request", { reason: "manual" });
    addEvent("Safe mode activated — waiting for peer.");
  }

  function acceptSafeMode(): void {
    setLocalSafeModeAccepted(true);
    void sendSignal("safe_mode.accept", { reason: "accepted" });
    // If the remote already accepted, lift blur
    if (remoteSafeModeAccepted) {
      setSafeModePending(false);
      setBlurActive(false);
      addEvent("Both accepted — safe mode lifted.");
    } else {
      addEvent("You accepted safe mode. Waiting for peer.");
    }
  }

  function rejectSafeMode(): void {
    void sendSignal("safe_mode.reject", { reason: "rejected" });
    void reportUser();
    void endChat();
    addEvent("Safe mode rejected — call ended and user reported.");
  }

  async function sendChat(): Promise<void> {
    const text = chatInput.trim();
    if (!text) {
      return;
    }

    const sent = await sendSignal("session.heartbeat", {
      reason: "chat",
      message: text,
      senderName: nickname || (role === "viewer" ? "Viewer" : "Host"),
    });

    if (!sent) {
      return;
    }

    addChatMessage({
      from: "me",
      text,
      at: new Date().toISOString(),
    });
    setChatInput("");
  }

  async function copyRequestCode(): Promise<void> {
    if (!requestCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(requestCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      setCopiedCode(false);
    }
  }

  async function copyInviteRoomLink(): Promise<void> {
    if (!requestCode) {
      return;
    }

    try {
      const link = `${window.location.origin}/join/${requestCode}`;
      await navigator.clipboard.writeText(link);
      setCopiedInviteLink(true);
      window.setTimeout(() => setCopiedInviteLink(false), 1500);
    } catch {
      setCopiedInviteLink(false);
    }
  }

  useEffect(() => {
    if (!isSetupReady || !quickStartFromUrl || autoQuickStartRef.current) {
      return;
    }

    if (queryRole === "host" && role !== "host") {
      return;
    }

    // Wait until invite-based host setup has been hydrated from URL state.
    if (role === "host" && inviteFromUrl && inviteCode !== inviteFromUrl) {
      return;
    }

    autoQuickStartRef.current = true;
    void oneTapQuickStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetupReady, quickStartFromUrl, queryRole, role, inviteFromUrl, inviteCode]);

  return (
    <GuestChatLayout>
      <div className="guest-video-container">
        <div className="guest-video-stage">
          {/* Error/Connection Status Banner */}
          {(mediaError || connectionError || apiError) && (
            <div className="guest-error-banner">
              <span className="error-icon">⚠️</span>
              <div className="error-content">
                <p className="error-title">
                  {mediaError ? "Camera Error" : connectionError ? "Connection Error" : "Server Error"}
                </p>
                <p className="error-message">
                  {mediaError || connectionError || apiError}
                </p>
              </div>
              <button
                className="error-close"
                onClick={() => {
                  setMediaError("");
                  setConnectionError("");
                  setApiError("");
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Remote video */}
          <div className="guest-video-remote-wrap">
            <video ref={remoteVideoRef} autoPlay playsInline className="guest-video-remote" />
            {!cameraEnabled && (
              <div className="guest-video-placeholder">
                <span className="placeholder-icon">📷</span>
                <span>Camera off</span>
              </div>
            )}
            {callState === "searching" && (
              <div className="guest-searching-overlay">
                <div className="spinner"></div>
                <p>Searching for someone...</p>
              </div>
            )}
          </div>

          {/* Local video */}
          <div className="guest-video-local-wrap">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="guest-video-local"
              style={{ display: cameraEnabled ? undefined : "none" }}
            />
            {!cameraEnabled && (
              <div className="guest-video-local-placeholder">
                <span>📷</span>
              </div>
            )}
          </div>

          {/* Status overlay */}
          <div className="guest-video-status">
            <p className="status-text">{statusText}</p>
            <p className="status-label">{callStateLabel}</p>
          </div>
        </div>

        {/* Simple controls */}
        <div className="guest-controls">
          <button
            className="guest-btn guest-btn-primary"
            onClick={() => void oneTapQuickStart()}
            disabled={isQuickStarting || callState === "searching"}
          >
            {isQuickStarting ? (
              <>
                <span className="btn-spinner"></span> Starting...
              </>
            ) : (
              <>▶ Start Chat</>
            )}
          </button>
          <button
            className={`guest-btn ${cameraEnabled ? "guest-btn-secondary" : "guest-btn-primary"}`}
            onClick={toggleCamera}
            disabled={mediaState !== "ready"}
            title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          >
            {cameraEnabled ? "📷" : "📷‍🗨️"} Camera
          </button>
          <button className="guest-btn guest-btn-secondary" onClick={() => void endChat()}>
            ☎️ End call
          </button>
        </div>

        {/* Chat messages */}
        {chatMessages.length > 0 && (
          <div className="guest-chat-panel">
            <div className="guest-chat-messages">
              {chatMessages.map((message, index) => (
                <div key={`${message.at}-${index}`} className={`guest-chat-bubble guest-chat-${message.from}`}>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            <form
              className="guest-chat-compose"
              onSubmit={(event) => {
                event.preventDefault();
                void sendChat();
              }}
            >
              <input
                placeholder="Say something..."
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
              />
              <button type="submit" disabled={wsState !== "open"}>
                Send
              </button>
            </form>
          </div>
        )}
      </div>

      <style jsx>{`
        .guest-video-container {
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 1rem;
          padding: 1rem;
          max-width: 100%;
          margin: 0 auto;
          width: 100%;
        }

        .guest-video-stage {
          position: relative;
          border-radius: 16px;
          border: 1px solid rgba(157, 190, 205, 0.28);
          background: #030a0f;
          overflow: hidden;
          flex: 1;
          min-height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .guest-video-remote-wrap {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
        }

        .guest-video-remote {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #030a0f;
        }

        .guest-video-placeholder {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          color: #a9c1cc;
          text-align: center;
        }

        .placeholder-icon {
          font-size: 3rem;
        }

        .guest-video-local-wrap {
          position: absolute;
          bottom: 1rem;
          right: 1rem;
          width: 120px;
          height: 160px;
          border-radius: 12px;
          overflow: hidden;
          border: 2px solid rgba(157, 190, 205, 0.4);
          background: #030a0f;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        }

        .guest-video-local {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .guest-video-local-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          background: rgba(7, 22, 33, 0.8);
        }

        .guest-video-status {
          position: absolute;
          bottom: 1rem;
          left: 1rem;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          padding: 0.75rem 1rem;
          border-radius: 8px;
          border: 1px solid rgba(157, 190, 205, 0.2);
        }

        .status-text {
          margin: 0;
          font-size: 0.95rem;
          color: #eff7fb;
          font-weight: 500;
        }

        .status-label {
          margin: 0.25rem 0 0;
          font-size: 0.8rem;
          color: #a9c1cc;
        }

        .guest-controls {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .guest-btn {
          padding: 0.75rem 1.5rem;
          border-radius: 12px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 200ms ease;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          white-space: nowrap;
        }

        .guest-btn-primary {
          background: linear-gradient(130deg, rgba(255, 140, 57, 0.28), rgba(255, 140, 57, 0.08));
          color: #ffd8bc;
          border: 1px solid rgba(255, 140, 57, 0.5);
        }

        .guest-btn-primary:hover:not(:disabled) {
          background: linear-gradient(130deg, rgba(255, 140, 57, 0.38), rgba(255, 140, 57, 0.18));
          border-color: #ff8c39;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(255, 140, 57, 0.2);
        }

        .guest-btn-secondary {
          background: rgba(7, 22, 33, 0.8);
          color: #eff7fb;
          border: 1px solid rgba(157, 190, 205, 0.28);
        }

        .guest-btn-secondary:hover:not(:disabled) {
          background: rgba(7, 22, 33, 0.95);
          border-color: rgba(255, 140, 57, 0.4);
          transform: translateY(-2px);
        }

        .guest-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .guest-chat-panel {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          background: rgba(7, 22, 33, 0.6);
          border: 1px solid rgba(157, 190, 205, 0.2);
          border-radius: 12px;
          padding: 1rem;
          max-height: 200px;
        }

        .guest-chat-messages {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          overflow-y: auto;
          flex: 1;
        }

        .guest-chat-bubble {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
        }

        .guest-chat-me {
          background: rgba(255, 140, 57, 0.1);
          align-self: flex-end;
          border: 1px solid rgba(255, 140, 57, 0.2);
        }

        .guest-chat-peer {
          background: rgba(49, 154, 255, 0.08);
          align-self: flex-start;
          border: 1px solid rgba(49, 154, 255, 0.2);
        }

        .guest-chat-bubble p {
          margin: 0;
          font-size: 0.85rem;
          color: #eff7fb;
          line-height: 1.4;
        }

        .guest-chat-compose {
          display: flex;
          gap: 0.5rem;
        }

        .guest-chat-compose input {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          border: 1px solid rgba(157, 190, 205, 0.2);
          background: rgba(7, 22, 33, 0.8);
          color: #eff7fb;
          font-size: 0.85rem;
        }

        .guest-chat-compose input:focus {
          outline: none;
          border-color: rgba(255, 140, 57, 0.4);
          background: rgba(7, 22, 33, 0.95);
        }

        .guest-chat-compose input::placeholder {
          color: #7a8d98;
        }

        .guest-chat-compose button {
          padding: 0.5rem 1rem;
          background: rgba(255, 140, 57, 0.15);
          border: 1px solid rgba(255, 140, 57, 0.3);
          border-radius: 8px;
          color: #ffd8bc;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 150ms ease;
        }

        .guest-chat-compose button:hover:not(:disabled) {
          background: rgba(255, 140, 57, 0.25);
          border-color: rgba(255, 140, 57, 0.5);
        }

        .guest-chat-compose button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .guest-video-container {
            padding: 0.75rem;
            gap: 0.75rem;
          }

          .guest-video-local-wrap {
            width: 100px;
            height: 133px;
          }

          .guest-controls {
            gap: 0.5rem;
          }

          .guest-btn {
            padding: 0.6rem 1rem;
            font-size: 0.85rem;
          }
        }

        /* Error Banner Styles */
        .guest-error-banner {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;
          background: linear-gradient(135deg, rgba(220, 53, 69, 0.95), rgba(180, 30, 45, 0.95));
          border-bottom: 2px solid rgba(255, 140, 57, 0.3);
          padding: 1rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          backdrop-filter: blur(8px);
          animation: slideDown 300ms ease-out;
        }

        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .error-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .error-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .error-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.01em;
        }

        .error-message {
          margin: 0;
          font-size: 0.8rem;
          color: #ffcccc;
          opacity: 0.9;
        }

        .error-close {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border: none;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 50%;
          color: #fff;
          font-size: 1.2rem;
          cursor: pointer;
          transition: all 150ms ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .error-close:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: scale(1.1);
        }

        /* Searching Overlay */
        .guest-searching-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(5, 15, 24, 0.85);
          backdrop-filter: blur(4px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          z-index: 40;
          border-radius: 16px;
          animation: fadeIn 300ms ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(255, 140, 57, 0.2);
          border-top-color: #ff8c39;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .guest-searching-overlay p {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: #eff7fb;
          letter-spacing: -0.01em;
        }

        /* Button Spinner */
        .btn-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-right: 6px;
        }
      `}</style>
    </GuestChatLayout>
  );
}
