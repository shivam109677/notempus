import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const MATCH_REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const INVITE_CODE = "11111111-1111-4111-8111-111111111111";

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockGatewayApi(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();

    let path = "";
    try {
      path = new URL(request.url()).pathname;
    } catch {
      await route.fallback();
      return;
    }

    if (path === "/health" && method === "GET") {
      await fulfillJson(route, { ok: true, service: "mock-gateway" });
      return;
    }

    if (path === "/v1/config/public" && method === "GET") {
      await fulfillJson(route, {
        webrtc: {
          stunUrl: "stun:stun.l.google.com:19302",
        },
        signaling: {
          wsUrl: "ws://127.0.0.1:4003/ws",
        },
      });
      return;
    }

    if (path === "/v1/auth/token" && method === "POST") {
      const body = request.postDataJSON() as { userId?: string; role?: string };
      await fulfillJson(route, {
        token: `token-${body.role ?? "unknown"}-${body.userId ?? "user"}`,
      });
      return;
    }

    if (path === "/v1/female/available" && method === "POST") {
      await fulfillJson(route, { status: "ok" });
      return;
    }

    if (path.startsWith("/v1/female/offers/") && method === "GET") {
      await fulfillJson(route, {
        offers: [
          {
            requestId: MATCH_REQUEST_ID,
            maleUserId: "22222222-2222-4222-8222-222222222222",
            mode: "paid_verified",
          },
        ],
      });
      return;
    }

    if (path === "/v1/match/join" && method === "POST") {
      await fulfillJson(route, {
        requestId: MATCH_REQUEST_ID,
        status: "offered",
        estimatedWaitSeconds: 1,
      });
      return;
    }

    if (path === `/v1/match/${MATCH_REQUEST_ID}` && method === "GET") {
      await fulfillJson(route, {
        id: MATCH_REQUEST_ID,
        status: "matched",
        offered_female_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });
      return;
    }

    if (path === "/v1/match/respond" && method === "POST") {
      await fulfillJson(route, {
        status: "matched",
        requestId: MATCH_REQUEST_ID,
      });
      return;
    }

    if (path === "/v1/match/leave" && method === "POST") {
      await fulfillJson(route, { status: "cancelled" });
      return;
    }

    if (path === "/v1/sessions/start" && method === "POST") {
      await fulfillJson(route, {
        status: "connected",
        sessionId: MATCH_REQUEST_ID,
      });
      return;
    }

    if (path === "/v1/sessions/stop" && method === "POST") {
      await fulfillJson(route, {
        status: "ended",
        sessionId: MATCH_REQUEST_ID,
      });
      return;
    }

    if (path.startsWith("/v1/wallet/") && method === "GET") {
      await fulfillJson(route, {
        balance_paise: 5000,
      });
      return;
    }

    if (path === "/v1/wallet/topup" && method === "POST") {
      await fulfillJson(route, {
        status: "credited",
        balance_paise: 10000,
      });
      return;
    }

    if (path === "/v1/payouts/request" && method === "POST") {
      await fulfillJson(route, {
        payoutId: "payout_mock_1",
        status: "requested",
      });
      return;
    }

    if (path === "/v1/verification/selfie" && method === "POST") {
      await fulfillJson(route, { status: "pending" });
      return;
    }

    if (path === "/v1/verification/live-check" && method === "POST") {
      await fulfillJson(route, { status: "approved" });
      return;
    }

    if (path === "/v1/reports" && method === "POST") {
      await fulfillJson(route, { status: "queued" });
      return;
    }

    if (path === "/v1/fraud/telemetry" && method === "POST") {
      await fulfillJson(route, { status: "accepted" });
      return;
    }

    await route.fallback();
  });
}

test("viewer can complete quick chat actions", async ({ browser }) => {
  const context = await browser.newContext();
  await mockGatewayApi(context);

  const page = await context.newPage();

  await page.goto("/chat/profile");
  await page.getByLabel("Display name").fill("Aman");
  await page.getByLabel("Interests").fill("music, gaming");
  await page.getByRole("button", { name: "Create pass now" }).click();
  await expect(page.getByText(/pass created/i)).toBeVisible();

  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/chat\/quick-start/);

  await page.getByRole("button", { name: "Start now" }).click();
  await expect(page).toHaveURL(/\/chat\?role=viewer&quick=1/);
  await expect(page.getByRole("heading", { name: /talk to someone new, right now/i })).toBeVisible();

  await page.getByRole("button", { name: "Start camera" }).click();
  await page.getByRole("button", { name: "Find someone" }).click();
  await page.getByRole("button", { name: "Connect room" }).click();

  await page.getByRole("button", { name: "Refresh balance" }).click();
  await page.getByRole("button", { name: "Top up" }).click();
  await page.getByRole("button", { name: "Report user" }).click();
  await page.getByRole("button", { name: "Flag suspicious behavior" }).click();
  await page.getByRole("button", { name: "Next chat" }).click();
  await page.getByRole("button", { name: "End chat" }).click();

  await page.getByText("Recent activity").click();
  await expect(page.getByText(/status 200/i).first()).toBeVisible();

  await context.close();
});

test("host can join invite flow and use host controls", async ({ browser }) => {
  const context = await browser.newContext();
  await mockGatewayApi(context);

  const page = await context.newPage();

  await page.goto("/chat/quick-start?role=host");
  await page.getByLabel("Invite code").fill(INVITE_CODE);
  await page.getByRole("button", { name: "Join friend room now" }).click();

  await expect(page).toHaveURL(new RegExp(`/chat\\?role=host&invite=${INVITE_CODE}&quick=1`));
  await expect(page.getByRole("heading", { name: /talk to someone new, right now/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request payout" })).toBeVisible();

  const acceptInvite = page.getByRole("button", { name: "Accept friend invite" });
  if (await acceptInvite.isVisible()) {
    if (await acceptInvite.isEnabled()) {
      await acceptInvite.click();
    }
  }
  await page.getByRole("button", { name: "Start call" }).click();
  await page.getByRole("button", { name: "Refresh balance" }).click();
  await page.getByRole("button", { name: "Request payout" }).click();
  await page.getByRole("button", { name: "Verify host profile" }).click();

  await page.getByText("Recent activity").click();
  await expect(page.getByText(/status 200/i).first()).toBeVisible();

  await context.close();
});
