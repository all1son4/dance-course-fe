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
  const isProduction = process.env.NODE_ENV === "production";

  if (origin) {
    return allowedOrigins.has(origin);
  }

  const refererOrigin = getOriginFromHeader(request.headers.get("referer"));

  if (refererOrigin) {
    return allowedOrigins.has(refererOrigin);
  }

  // In production, browser-origin protected endpoints should reject requests
  // without origin metadata.
  return !isProduction;
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

export const jsonErrorNoStore = (
  errorCode: string,
  init: {
    headers?: Record<string, string>;
    status: number;
  },
) =>
  jsonNoStore(
    {
      errorCode,
    },
    init,
  );

export const getBrowserJsonRequestErrorResponse = (
  request: Request,
  maxBodyBytes: number,
) => {
  if (!isTrustedBrowserOrigin(request)) {
    return jsonErrorNoStore("invalid_origin", { status: 403 });
  }

  if (isPayloadTooLarge(request, maxBodyBytes)) {
    return jsonErrorNoStore("payload_too_large", { status: 413 });
  }

  if (!hasJsonContentType(request)) {
    return jsonErrorNoStore("unsupported_media_type", { status: 415 });
  }

  return null;
};

type BoundedTextBodyResult =
  { status: "ok"; text: string } | { status: "too_large" } | { status: "invalid" };

export const readBoundedTextBody = async (
  request: Request,
  maxBytes: number,
): Promise<BoundedTextBodyResult> => {
  if (!request.body) {
    return { status: "ok", text: "" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "too_large" };
      }

      chunks.push(value);
    }
  } catch {
    return { status: "invalid" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { status: "ok", text: new TextDecoder().decode(bytes) };
};

export const parseJsonBody = async <T>(
  request: Request,
  maxBytes: number,
): Promise<{ body: T | null; errorResponse: Response | null }> => {
  const result = await readBoundedTextBody(request, maxBytes);

  if (result.status === "too_large") {
    return {
      body: null,
      errorResponse: jsonErrorNoStore("payload_too_large", { status: 413 }),
    };
  }

  if (result.status === "invalid") {
    return { body: null, errorResponse: null };
  }

  try {
    return { body: JSON.parse(result.text) as T, errorResponse: null };
  } catch {
    return { body: null, errorResponse: null };
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
