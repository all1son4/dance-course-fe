import { NextResponse } from "next/server";

export const API_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Expires: "0",
  Pragma: "no-cache",
  "Surrogate-Control": "no-store",
} as const;

const normalizeSiteOrigin = (value: string | null | undefined) => {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    return "";
  }

  try {
    const url = new URL(normalizedValue);
    return url.origin;
  } catch {
    return "";
  }
};

const getAllowedOrigins = (request: Request) => {
  const requestOrigin = normalizeSiteOrigin(request.url);
  const siteOrigin = normalizeSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const vercelOrigin = process.env.VERCEL_URL
    ? normalizeSiteOrigin(`https://${process.env.VERCEL_URL}`)
    : "";
  const localhostPort = (process.env.PORT ?? "3000").trim() || "3000";

  return new Set(
    [
      requestOrigin,
      siteOrigin,
      vercelOrigin,
      `http://localhost:${localhostPort}`,
      `http://127.0.0.1:${localhostPort}`,
    ].filter(Boolean),
  );
};

const getOriginFromHeader = (value: string | null) => {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

export const isTrustedBrowserOrigin = (request: Request) => {
  const allowedOrigins = getAllowedOrigins(request);
  const origin = getOriginFromHeader(request.headers.get("origin"));

  if (origin) {
    return allowedOrigins.has(origin);
  }

  const refererOrigin = getOriginFromHeader(request.headers.get("referer"));

  if (refererOrigin) {
    return allowedOrigins.has(refererOrigin);
  }

  // Keep server-to-server compatibility for cases when these headers are absent.
  return true;
};

export const isPayloadTooLarge = (request: Request, maxBytes: number) => {
  const contentLengthHeader = request.headers.get("content-length")?.trim() ?? "";
  const contentLength = Number(contentLengthHeader);

  return Number.isFinite(contentLength) && contentLength > maxBytes;
};

export const hasJsonContentType = (request: Request) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json");
};

export const parseJsonBody = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};

export const jsonNoStore = (
  body: unknown,
  init?: {
    headers?: Record<string, string>;
    status?: number;
  },
) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...API_NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
