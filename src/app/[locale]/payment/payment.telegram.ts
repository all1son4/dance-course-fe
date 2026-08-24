import {
  PAYMENT_API_ENDPOINTS,
  type RenewalVerificationResponse,
} from "./payment.helpers";

const TELEGRAM_LOGIN_SCRIPT_SRC = "https://telegram.org/js/telegram-login.js";

let telegramLoginScriptPromise: Promise<void> | null = null;

type TelegramLoginResult = {
  error?: string;
  id_token?: string;
};

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: {
            client_id: number;
            lang?: string;
            nonce?: string;
            scope?: string[];
          },
          callback: (result: TelegramLoginResult) => void,
        ) => void;
      };
    };
  }
}

export const loadTelegramLoginScript = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window_unavailable"));
  }

  if (window.Telegram?.Login?.auth) {
    return Promise.resolve();
  }

  if (telegramLoginScriptPromise) {
    return telegramLoginScriptPromise;
  }

  telegramLoginScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TELEGRAM_LOGIN_SCRIPT_SRC}"]`,
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("telegram_login_script_failed")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = TELEGRAM_LOGIN_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("telegram_login_script_failed"));
    document.head.appendChild(script);
  }).catch((error) => {
    telegramLoginScriptPromise = null;
    throw error;
  });

  return telegramLoginScriptPromise;
};

export const requestTelegramIdToken = ({
  clientId,
  locale,
  nonce,
}: {
  clientId: number;
  locale: string;
  nonce: string;
}) =>
  new Promise<string>((resolve, reject) => {
    window.Telegram?.Login?.auth(
      {
        client_id: clientId,
        lang: locale,
        nonce,
        scope: ["profile"],
      },
      (result) => {
        window.focus();

        if (result.error) {
          reject(new Error(result.error));
          return;
        }

        if (!result.id_token) {
          reject(new Error("missing_telegram_id_token"));
          return;
        }

        resolve(result.id_token);
      },
    );
  });

export const verifyRenewalTelegramMembership = async ({
  checkoutSessionId,
  claimedUsername,
  idToken,
  nonce,
  slug,
}: {
  checkoutSessionId: string;
  claimedUsername: string;
  idToken: string;
  nonce: string;
  slug: string;
}) => {
  const response = await fetch(PAYMENT_API_ENDPOINTS.telegramRenewal, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      claimedUsername,
      checkoutSessionId,
      idToken,
      nonce,
      slug,
    }),
    cache: "no-store",
  });
  const data = (await response.json()) as RenewalVerificationResponse;

  return {
    data,
    isSuccessful: response.ok && data.status === "verified",
  };
};
