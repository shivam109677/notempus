"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import ProfileDialog from "../../components/ProfileDialog";
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

  const activeUserId = role === "viewer" ? viewerUserId : hostUserId;
  const oppositeUserId = role === "viewer" ? hostUserId : viewerUserId;
  const activeToken = role === "viewer" ? viewerToken : hostToken;
  const queryRole = searchParams.get("role");
  const inviteFromUrl = searchParams.get("invite")?.trim() ?? "";
  const quickStartFromUrl = searchParams.get("quick") === "1";

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

  async function runAction(
    title: string,
    fn: () => Promise<{ status: number; payload: unknown }>,
  ): Promise<{ status: number; payload: unknown } | null> {
    try {
      const result = await fn();
      addApiLog(title, result.status, result.payload);
      return result;
    } catch (error) {
      addApiLog(title, 0, { error: error instanceof Error ? error.message : "unknown_error" });
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

    const payload = result.payload as { token?: string };
    if (!payload.token) {
      return null;
    }

    setRoleToken(targetRole, payload.token);
    return payload.token;
  }

  async function ensureToken(targetRole: UserRole = role): Promise<string | null> {
    const cached = targetRole === "viewer" ? viewerToken : hostToken;
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

    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      let settled = false;
      const done = (ok: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
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
        addEvent("Realtime connection failed.");
        done(false);
      };

      ws.onclose = () => {
        setWsState("closed");
        done(false);
      };

      window.setTimeout(() => {
        done(ws.readyState === WebSocket.OPEN);
      }, 5000);
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
    <div className="site-root">
      <ProfileDialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
        onSaved={(saved) => {
          setNickname(saved.nickname);
          setRole(saved.role);
          setMatchMode(saved.matchMode);
        }}
      />

      <header className="site-header">
        <Link href="/" className="brand-link">
          Notempus
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/chat">Chat</Link>
          <Link href="/join">Join invite</Link>
          <Link href="/earn">Earn</Link>
          <Link href="/safety">Safety</Link>
          <button
            type="button"
            className="btn-profile-trigger"
            onClick={() => setProfileDialogOpen(true)}
          >
            {nickname ? `✏️ ${nickname}` : "⚙️ Set up profile"}
          </button>
        </nav>
      </header>

      <main className="chat-page-wrap">
        <section className="video-stage-card">
          <div className="stage-head">
            <h1>Talk to someone new, right now</h1>
            <p>{statusText}</p>
          </div>

          <div className="video-stage">
            {/* Remote video + blur overlay */}
            <div style={{ position: "relative", flex: 1 }}>
              <video ref={remoteVideoRef} autoPlay playsInline className="video-remote" />
              {(blurActive || safeModePending) && (
                <div className="safe-mode-overlay">
                  <span className="safe-mode-badge">🛡 Safe mode active</span>
                </div>
              )}
            </div>
            <div className="remote-overlay">{callStateLabel}</div>

            {/* Local video tile with camera-off placeholder */}
            <div className="video-local-wrap" style={{ position: "relative" }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="video-local"
                style={{ display: cameraEnabled ? undefined : "none" }}
              />
              {!cameraEnabled && (
                <div className="video-off-placeholder">
                  <span className="video-off-icon">📷</span>
                  <span>Camera off</span>
                </div>
              )}
            </div>

            {/* Safe-mode consent modal */}
            {safeModePending && !localSafeModeAccepted && (
              <div className="dialog-backdrop">
                <div className="safe-mode-modal">
                  <h3>🛡 Unsafe content detected</h3>
                  <p>
                    Your peer has triggered safe mode. Accept to keep the call
                    with cameras blurred, or reject and leave the room.
                  </p>
                  <div className="safe-mode-actions">
                    <button className="btn-primary" onClick={acceptSafeMode}>
                      Accept safe mode
                    </button>
                    <button className="btn-ghost" onClick={rejectSafeMode}>
                      Reject & leave
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="stage-controls">
            <button className="btn-primary" onClick={() => void oneTapQuickStart()} disabled={isQuickStarting}>
              {isQuickStarting ? "Starting..." : "One-tap quick start"}
            </button>
            <button
              type="button"
              className={cameraEnabled ? "btn-secondary" : "btn-primary"}
              onClick={toggleCamera}
              title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
              disabled={mediaState !== "ready"}
            >
              {cameraEnabled ? "📷 Camera on" : "📷 Camera off"}
            </button>
            <button
              type="button"
              className={blurActive ? "btn-primary" : "btn-secondary"}
              onClick={activateSafeMode}
              title="Activate safe mode (blurs both cameras until both accept)"
              disabled={callState !== "live"}
            >
              🛡 Safe mode
            </button>
            <Link className="btn-secondary" href="/chat/profile">
              Profile page
            </Link>
            <Link className="btn-secondary" href={quickStartPath}>
              Quick start page
            </Link>
            <Link className="btn-secondary" href="/chat/invite">
              Invite page
            </Link>
            <button className="btn-primary" onClick={() => void startLocalMedia()}>
              Start camera
            </button>
            <button className="btn-secondary" onClick={() => void startMatching()}>
              {role === "host" ? "Go live" : "Find someone"}
            </button>
            {role === "host" ? (
              <button className="btn-secondary" onClick={() => void acceptInviteAndStart()} disabled={!inviteCode}>
                Accept friend invite
              </button>
            ) : null}
            <button className="btn-secondary" onClick={() => void connectSignaling()}>
              Connect room
            </button>
            <button className="btn-secondary" onClick={() => void startCall()}>
              Start call
            </button>
            <button className="btn-secondary" onClick={() => void nextChat()}>
              Next chat
            </button>
            <button className="btn-ghost" onClick={() => void endChat()}>
              End chat
            </button>
          </div>

          {mediaError ? <p className="error-note">Camera error: {mediaError}</p> : null}

          <section className="chat-box" aria-label="In-room chat">
            <div className="chat-stream">
              {chatMessages.length === 0 ? (
                <p className="empty-note">Say hi to break the ice.</p>
              ) : (
                chatMessages.map((message, index) => (
                  <article key={`${message.at}-${index}`} className={`chat-bubble ${message.from}`}>
                    <p>{message.text}</p>
                    <span>{new Date(message.at).toLocaleTimeString()}</span>
                  </article>
                ))
              )}
            </div>
            <form
              className="chat-compose"
              onSubmit={(event) => {
                event.preventDefault();
                void sendChat();
              }}
            >
              <input
                placeholder="Type a message"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
              />
              <button className="btn-secondary" type="submit" disabled={wsState !== "open"}>
                Send
              </button>
            </form>
          </section>
        </section>

        <aside className="chat-sidebar">
          <article className="panel-card">
            <h2>Profile and setup pages</h2>
            <p className="muted-text">
              Profile, quick start, and invite setup now live on dedicated pages for a cleaner user flow.
            </p>
            <div className="inline-actions">
              <Link className="btn-primary" href="/chat/profile">
                Open profile page
              </Link>
              <Link className="btn-secondary" href={quickStartPath}>
                Open quick start page
              </Link>
              <button className="btn-secondary" onClick={() => void mintToken(role)}>
                Refresh pass
              </button>
              <button className="btn-secondary" onClick={() => void checkGatewayHealth()}>
                Refresh connection
              </button>
            </div>
            <p className="small-note">
              Current profile: {nickname || "Guest"} · {role === "host" ? "Host" : "Viewer"} ·{" "}
              {genderIdentity.replace("_", " ")} · {creatorProfile === "creator" ? "Creator" : "Normal user"}
            </p>
          </article>

          <article className="panel-card">
            <h2>Invite and matching page</h2>
            <p className="muted-text">
              {role === "viewer"
                ? "Use the invite page to share your room quickly with friends."
                : "Open invite page to join a friend room with a code or link."}
            </p>
            <div className="inline-actions">
              <Link className="btn-primary" href="/chat/invite">
                Open invite page
              </Link>
              {role === "host" ? (
                <Link className="btn-secondary" href="/join">
                  Enter invite code
                </Link>
              ) : null}
            </div>

            {role === "viewer" ? (
              <div className="code-box">
                <p>Invite code</p>
                <strong>{requestCode ? requestCode : "Not created yet"}</strong>
                <div className="inline-actions">
                  <button className="btn-secondary" onClick={() => void copyRequestCode()} disabled={!requestCode}>
                    {copiedCode ? "Copied code" : "Copy code"}
                  </button>
                  <button className="btn-secondary" onClick={() => void copyInviteRoomLink()} disabled={!requestCode}>
                    {copiedInviteLink ? "Copied link" : "Copy invite link"}
                  </button>
                  {inviteRoomPath ? (
                    <a className="btn-ghost" href={inviteRoomPath}>
                      Open invite link
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <p className="small-note">Invite code loaded: {inviteCode || "None yet"}</p>
                <div className="inline-actions">
                  {inviteCode ? (
                    <button className="btn-primary" onClick={() => void acceptInviteAndStart()}>
                      Accept and join room
                    </button>
                  ) : null}
                </div>
              </>
            )}

            <p className="muted-text">Chat room: {sessionId || "Preparing..."}</p>
          </article>

          <article className="panel-card">
            <h2>{role === "host" ? "Host earnings" : "Viewer wallet"}</h2>
            <p className="wallet-balance">
              Balance: {walletBalance === null ? "Not loaded" : `${(walletBalance / 100).toFixed(2)} INR`}
            </p>

            <div className="field-grid">
              <label>
                Top-up amount (INR)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={topupAmount}
                  onChange={(event) => setTopupAmount(Number(event.target.value || 0))}
                />
              </label>
              <label>
                Payout amount (INR)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={payoutAmount}
                  onChange={(event) => setPayoutAmount(Number(event.target.value || 0))}
                />
              </label>
            </div>

            <div className="inline-actions">
              <button className="btn-secondary" onClick={() => void refreshWallet()}>
                Refresh balance
              </button>
              {role === "viewer" ? (
                <button className="btn-secondary" onClick={() => void topupWallet()}>
                  Top up
                </button>
              ) : (
                <button className="btn-secondary" onClick={() => void requestPayout()}>
                  Request payout
                </button>
              )}
            </div>
          </article>

          <article className="panel-card">
            <h2>Safety and trust</h2>
            <p className="muted-text">Verification status: {verificationStatus}</p>
            <div className="inline-actions">
              <button className="btn-secondary" onClick={() => void runVerification()}>
                Verify host profile
              </button>
              <button className="btn-secondary" onClick={() => void reportUser()}>
                Report user
              </button>
              <button className="btn-ghost" onClick={() => void sendSafetyTelemetry()}>
                Flag suspicious behavior
              </button>
            </div>
          </article>

          <article className="panel-card">
            <h2>Connection status</h2>
            <div className="chips-row">
              <span className={`status-chip ${gatewayState}`}>App: {gatewayState}</span>
              <span className={`status-chip ${wsState}`}>Room: {wsState}</span>
              <span className={`status-chip ${mediaState}`}>Camera: {mediaState}</span>
              <span className={`status-chip ${callState}`}>Call: {callStateLabel}</span>
            </div>
          </article>

          <details className="panel-card">
            <summary>Recent activity</summary>
            {latestApi ? <p className="muted-text">Latest action: {latestApi.title}</p> : null}

            <div className="activity-columns">
              <div className="activity-list">
                <h3>Realtime feed</h3>
                {feedEvents.length === 0 ? (
                  <p className="empty-note">No events yet.</p>
                ) : (
                  feedEvents.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)
                )}
              </div>

              <div className="activity-list">
                <h3>System events</h3>
                {apiLogs.length === 0 ? (
                  <p className="empty-note">No events yet.</p>
                ) : (
                  apiLogs.map((item, index) => (
                    <article key={`${item.at}-${index}`} className="api-log-card">
                      <div>
                        <strong>{item.title}</strong>
                        <span>{new Date(item.at).toLocaleTimeString()}</span>
                      </div>
                      <p className={item.status > 0 && item.status < 400 ? "ok-text" : "error-text"}>status {item.status}</p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </details>
        </aside>
      </main>
    </div>
  );
}