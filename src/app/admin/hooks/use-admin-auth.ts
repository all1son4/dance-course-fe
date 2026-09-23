"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { ADMIN_API_ENDPOINTS, ADMIN_SESSION_HEARTBEAT_MS } from "../lib/admin.constants";
import type { AuthResponse, AuthState, StatusMessage } from "../lib/admin.types";
import {
  type AdminAuthCheckOutcome,
  getAdminAuthCheckOutcome,
} from "../lib/admin-auth-check";
import { ADMIN_NETWORK_ERROR_CODE, requestAdminJson } from "../lib/admin-request";

const AUTH_NOT_CONFIGURED_STATUS_TEXT = "Не задан ADMIN_PASSWORD на сервере.";

const UNLOCK_ERROR_MESSAGES: Record<string, string> = {
  auth_not_configured: AUTH_NOT_CONFIGURED_STATUS_TEXT,
  invalid_password: "Неверный пароль.",
  rate_limited: "Слишком много попыток. Подожди минуту и попробуй снова.",
  rate_limit_unavailable:
    "Вход временно недоступен. Попробуй позже; пароль менять не нужно.",
};

const RETURN_CHECK_INTERVAL_MS = 15_000;

export const useAdminAuth = () => {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authPassword, setAuthPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSessionCheckUnavailable, setIsSessionCheckUnavailable] = useState(false);
  const [authStatus, setAuthStatus] = useState<StatusMessage>({
    text: "Проверяю сессию...",
    tone: "info",
  });

  const isChecking = authState === "checking";
  const isAuthorized = authState === "authorized";
  const authStateRef = useRef<AuthState>("checking");
  const isSessionCheckUnavailableRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const lastCheckStartedAtRef = useRef(0);
  const isAuthTransitioningRef = useRef(false);

  const changeAuthState = useCallback((nextState: AuthState) => {
    authStateRef.current = nextState;
    setAuthState(nextState);
  }, []);

  const changeSessionCheckUnavailable = useCallback((unavailable: boolean) => {
    isSessionCheckUnavailableRef.current = unavailable;
    setIsSessionCheckUnavailable(unavailable);
  }, []);

  const handleSessionExpired = useCallback(() => {
    requestSequenceRef.current += 1;
    changeAuthState("locked");
    changeSessionCheckUnavailable(false);
    setAuthStatus({
      text: "Сессия закончилась. Введи пароль снова.",
      tone: "error",
    });
  }, [changeAuthState, changeSessionCheckUnavailable]);

  const checkAuthState = useCallback(
    async ({
      silent = false,
      skipIfRecent = false,
    }: { silent?: boolean; skipIfRecent?: boolean } = {}): Promise<
      AdminAuthCheckOutcome | "skipped"
    > => {
      if (isAuthTransitioningRef.current) {
        return "skipped";
      }

      if (
        skipIfRecent &&
        Date.now() - lastCheckStartedAtRef.current < RETURN_CHECK_INTERVAL_MS
      ) {
        return "skipped";
      }

      const requestSequence = ++requestSequenceRef.current;
      const wasAuthorized = authStateRef.current === "authorized";

      lastCheckStartedAtRef.current = Date.now();

      if (!silent && !wasAuthorized) {
        changeAuthState("checking");
        setAuthStatus({
          text: "Проверяю сессию...",
          tone: "info",
        });
      }

      const result = await requestAdminJson<AuthResponse>(ADMIN_API_ENDPOINTS.auth);
      const outcome = getAdminAuthCheckOutcome(result);

      // A slower check started before login/logout must not overwrite the
      // result of the newer action.
      if (requestSequence !== requestSequenceRef.current) {
        return "skipped";
      }

      if (outcome === "authorized") {
        changeAuthState("authorized");
        changeSessionCheckUnavailable(false);
        setAuthStatus(null);
        return outcome;
      }

      if (outcome === "not_configured") {
        changeAuthState("locked");
        changeSessionCheckUnavailable(false);
        setAuthStatus({
          text: AUTH_NOT_CONFIGURED_STATUS_TEXT,
          tone: "error",
        });
        return outcome;
      }

      if (outcome === "unauthorized") {
        changeAuthState("locked");
        changeSessionCheckUnavailable(false);
        setAuthStatus({
          text: wasAuthorized
            ? "Сессия закончилась. Введи пароль снова."
            : "Введи пароль для доступа к админке.",
          tone: wasAuthorized ? "error" : "info",
        });
        return outcome;
      }

      // No response does not prove expiry. Keep an already-open workspace,
      // where every API call still performs server-side authorization.
      if (!wasAuthorized) {
        changeAuthState("locked");
      }

      changeSessionCheckUnavailable(true);
      setAuthStatus({
        text: wasAuthorized
          ? "Не удалось проверить сессию. Возможно, это временный сбой; попробуй ещё раз."
          : "Не удалось проверить сессию. Проверь соединение и повтори проверку — вводить пароль заново может не понадобиться.",
        tone: "error",
      });
      return outcome;
    },
    [changeAuthState, changeSessionCheckUnavailable],
  );

  useEffect(() => {
    void checkAuthState();

    const sessionHeartbeat = window.setInterval(() => {
      if (authStateRef.current === "authorized") {
        void checkAuthState({ silent: true });
      }
    }, ADMIN_SESSION_HEARTBEAT_MS);

    const checkOnReturn = () => {
      if (
        document.visibilityState === "visible" &&
        (authStateRef.current === "authorized" || isSessionCheckUnavailableRef.current)
      ) {
        void checkAuthState({ silent: true, skipIfRecent: true });
      }
    };

    window.addEventListener("focus", checkOnReturn);
    document.addEventListener("visibilitychange", checkOnReturn);

    return () => {
      window.clearInterval(sessionHeartbeat);
      window.removeEventListener("focus", checkOnReturn);
      document.removeEventListener("visibilitychange", checkOnReturn);
      requestSequenceRef.current += 1;
    };
  }, [checkAuthState]);

  const refreshSession = async ({ after }: { after?: () => Promise<void> } = {}) => {
    if (isRefreshingSession) {
      return;
    }

    setIsRefreshingSession(true);

    try {
      const outcome = await checkAuthState({ silent: true });

      if (outcome === "authorized") {
        await after?.();
      }
    } finally {
      setIsRefreshingSession(false);
    }
  };

  const logout = async ({ onLoggedOut }: { onLoggedOut?: () => void } = {}) => {
    if (isLoggingOut || isAuthTransitioningRef.current) {
      return;
    }

    isAuthTransitioningRef.current = true;
    requestSequenceRef.current += 1;
    setIsLoggingOut(true);

    try {
      const result = await requestAdminJson(ADMIN_API_ENDPOINTS.auth, {
        method: "DELETE",
      });

      if (result.ok) {
        changeAuthState("locked");
        changeSessionCheckUnavailable(false);
        setAuthPassword("");
        onLoggedOut?.();
        setAuthStatus({ text: "Вы вышли из админки.", tone: "info" });
      } else {
        // A lost/malformed DELETE response does not tell us whether the
        // browser received the cookie deletion. Reconcile with the server.
        isAuthTransitioningRef.current = false;
        const outcome = await checkAuthState({ silent: true });

        if (outcome === "authorized") {
          setAuthStatus({
            text: "Выход не завершён: сессия ещё активна. Попробуй снова.",
            tone: "error",
          });
        } else if (outcome === "unauthorized") {
          setAuthPassword("");
          onLoggedOut?.();
          setAuthStatus({ text: "Вы вышли из админки.", tone: "info" });
        }
      }
    } finally {
      isAuthTransitioningRef.current = false;
      setIsLoggingOut(false);
    }
  };

  const submitUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authPassword.trim() || isUnlocking || isAuthTransitioningRef.current) {
      return;
    }

    isAuthTransitioningRef.current = true;
    requestSequenceRef.current += 1;
    setIsUnlocking(true);
    changeSessionCheckUnavailable(false);
    setAuthStatus({
      text: "Проверяю пароль...",
      tone: "info",
    });

    try {
      const result = await requestAdminJson<AuthResponse>(ADMIN_API_ENDPOINTS.auth, {
        body: { password: authPassword },
        method: "POST",
      });

      if (result.ok && result.data.authorized) {
        changeAuthState("authorized");
        changeSessionCheckUnavailable(false);
        setAuthPassword("");
        setAuthStatus(null);
      } else if (result.errorCode === ADMIN_NETWORK_ERROR_CODE) {
        // The POST may have succeeded even if its response was lost. A fresh
        // GET determines whether a new cookie actually reached the browser.
        isAuthTransitioningRef.current = false;
        const outcome = await checkAuthState({ silent: true });

        if (outcome === "authorized") {
          setAuthPassword("");
        } else if (outcome === "unauthorized") {
          setAuthStatus({
            text: "Не удалось подтвердить вход. Попробуй снова.",
            tone: "error",
          });
        }
      } else {
        setAuthStatus({
          text:
            UNLOCK_ERROR_MESSAGES[result.errorCode] ??
            "Не удалось авторизоваться. Попробуй снова.",
          tone: "error",
        });
      }
    } finally {
      isAuthTransitioningRef.current = false;
      setIsUnlocking(false);
    }
  };

  return {
    authPassword,
    authStatus,
    handleSessionExpired,
    isAuthorized,
    isChecking,
    isLoggingOut,
    isRefreshingSession,
    isSessionCheckUnavailable,
    isUnlocking,
    logout,
    refreshSession,
    retrySessionCheck: () => checkAuthState(),
    setAuthPassword,
    submitUnlock,
  };
};
