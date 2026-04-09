import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Notempus Admin", charset="UTF-8"',
    },
  });
}

export function middleware(request: NextRequest): NextResponse {
  const configuredUser = process.env.ADMIN_PANEL_USER?.trim() || "owner";
  const configuredPassword =
    process.env.ADMIN_PANEL_PASSWORD?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    (process.env.NODE_ENV === "development" ? "owner-local-pass" : undefined);

  if (!configuredPassword) {
    return new NextResponse("Admin panel is not configured. Set ADMIN_PANEL_USER and ADMIN_PANEL_PASSWORD.", {
      status: 503,
    });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return unauthorized();
  }

  const encoded = authHeader.slice(6);
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex <= 0) {
    return unauthorized();
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (username !== configuredUser || password !== configuredPassword) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};