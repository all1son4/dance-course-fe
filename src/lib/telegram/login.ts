import { webcrypto } from "node:crypto";

const TELEGRAM_OAUTH_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_JWKS_URL = `${TELEGRAM_OAUTH_ISSUER}/.well-known/jwks.json`;
const TELEGRAM_JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const TELEGRAM_ID_TOKEN_CLOCK_SKEW_SECONDS = 60;

type TelegramJwk = JsonWebKey & {
  kid?: string;
};

type TelegramJwks = {
  keys?: TelegramJwk[];
};

type TelegramLoginClaims = {
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string | string[];
  sub?: string;
  id?: number | string;
  name?: string;
  preferred_username?: string;
};

type JwksCache = {
  expiresAt: number;
  keys: TelegramJwk[];
};

let jwksCache: JwksCache | null = null;

export const getTelegramLoginClientId = () =>
  process.env.TELEGRAM_LOGIN_CLIENT_ID?.trim() ?? "";

export const isTelegramLoginConfigured = () => Boolean(getTelegramLoginClientId());

const decodeBase64Url = (value: string) => {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const normalized = padded.replaceAll("-", "+").replaceAll("_", "/");

  return Buffer.from(normalized, "base64");
};

const parseJwtPart = <T>(value: string): T => {
  const decoded = decodeBase64Url(value).toString("utf8");

  return JSON.parse(decoded) as T;
};

const getTelegramJwks = async () => {
  if (jwksCache && jwksCache.expiresAt > Date.now()) {
    return jwksCache.keys;
  }

  const response = await fetch(TELEGRAM_JWKS_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("telegram_jwks_fetch_failed");
  }

  const data = (await response.json()) as TelegramJwks;
  const keys = Array.isArray(data.keys) ? data.keys : [];

  jwksCache = {
    expiresAt: Date.now() + TELEGRAM_JWKS_CACHE_TTL_MS,
    keys,
  };

  return keys;
};

const getExpectedAudience = () => {
  const clientId = getTelegramLoginClientId();

  if (!clientId) {
    throw new Error("telegram_login_not_configured");
  }

  return clientId;
};

const isExpectedAudience = (audience: string | string[] | undefined) => {
  const expectedAudience = getExpectedAudience();

  return Array.isArray(audience)
    ? audience.includes(expectedAudience)
    : audience === expectedAudience;
};

const assertClaimsAreValid = (claims: TelegramLoginClaims) => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (claims.iss !== TELEGRAM_OAUTH_ISSUER) {
    throw new Error("telegram_login_invalid_issuer");
  }

  if (!isExpectedAudience(claims.aud)) {
    throw new Error("telegram_login_invalid_audience");
  }

  if (!claims.exp || claims.exp + TELEGRAM_ID_TOKEN_CLOCK_SKEW_SECONDS < nowSeconds) {
    throw new Error("telegram_login_expired");
  }

  if (!claims.sub && !claims.id) {
    throw new Error("telegram_login_missing_user_id");
  }
};

const importTelegramJwtKey = async (jwk: TelegramJwk, algorithm: string) => {
  if (algorithm !== "RS256" || jwk.kty !== "RSA") {
    throw new Error("telegram_login_unsupported_algorithm");
  }

  return webcrypto.subtle.importKey(
    "jwk",
    jwk,
    {
      hash: "SHA-256",
      name: "RSASSA-PKCS1-v1_5",
    },
    false,
    ["verify"],
  );
};

export const verifyTelegramLoginIdToken = async (idToken: string) => {
  const tokenParts = idToken.trim().split(".");

  if (tokenParts.length !== 3) {
    throw new Error("telegram_login_invalid_token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = tokenParts;
  const header = parseJwtPart<{ alg?: string; kid?: string }>(encodedHeader);
  const claims = parseJwtPart<TelegramLoginClaims>(encodedPayload);
  const keys = await getTelegramJwks();
  const key = keys.find((candidate) =>
    header.kid ? candidate.kid === header.kid : candidate.kty === "RSA",
  );

  if (!key) {
    throw new Error("telegram_login_key_not_found");
  }

  const cryptoKey = await importTelegramJwtKey(key, header.alg ?? "");
  const isSignatureValid = await webcrypto.subtle.verify(
    {
      name: "RSASSA-PKCS1-v1_5",
    },
    cryptoKey,
    decodeBase64Url(encodedSignature),
    Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
  );

  if (!isSignatureValid) {
    throw new Error("telegram_login_invalid_signature");
  }

  assertClaimsAreValid(claims);

  return claims;
};

export const getTelegramUserIdFromClaims = (claims: TelegramLoginClaims) => {
  const userId = claims.id ?? claims.sub ?? "";

  return String(userId).trim();
};
