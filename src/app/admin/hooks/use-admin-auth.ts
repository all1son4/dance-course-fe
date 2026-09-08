"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS, ADMIN_SESSION_HEARTBEAT_MS } from "../lib/admin.constants";
import type { AuthResponse, AuthState, StatusMessage } from "../lib/admin.types";
import { ADMIN_NETWORK_ERROR_CODE, requestAdminJson } from "../lib/admin-request";

const AUTH_NOT_CONFIGURED_STATUS_TEXT = "Не задан ADMIN_PASSWORD на сервере.";

const UNLOCK_ERROR_MESSAGES: Record<string, string> = {
  auth_not_configured: AUTH_NOT_CONFIGURED_STATUS_TEXT,
  invalid_password: "Неверный пароль.",
  network_error: "Ошибка сети при авторизации.",
};

export const useAdminAuth = () => {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authPassword, setAuthPassword] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [authStatus, setAuthStatus] = useState<StatusMessage>({
    text: "Проверяю сессию...",
    tone: "info",
  });

  const isChecking = authState === "checking";
  const isAuthorized = authState === "authorized";

  const handleSessionExpired = useCallback(() => {
    setAuthState("locked");
    setAuthStatus({
      text: "Сессия истекла. Введи пароль снова.",
      tone: "error",
    });
  }, []);

  const checkAuthState = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setAuthStatus({
          text: "Проверяю сессию...",
          tone: "info",
        });
      }

      const result = await requestAdminJson<AuthResponse>(ADMIN_API_ENDPOINTS.auth);

      if (result.errorCode === ADMIN_NETWORK_ERROR_CODE) {
        setAuthState("locked");
        setAuthStatus({
          text: "Не удалось проверить авторизацию. Попробуй обновить страницу.",
          tone: "error",
        });
        return;
      }

      if (result.ok && result.data.authorized) {
        setAuthState("authorized");

        if (!silent) {
          setAuthStatus(null);
        }

        return;
      }

      setAuthState("locked");

      if (result.errorCode === "auth_not_configured") {
        setAuthStatus({
          text: AUTH_NOT_CONFIGURED_STATUS_TEXT,
          tone: "error",
        });
        return;
      }

      setAuthStatus({
        text: silent
          ? "Сессия завершена. Введи пароль снова."
          : "Введи пароль для доступа к админке.",
        tone: "info",
      });
    },
    [],
  );

  useEffect(() => {
    void checkAuthState();

    const sessionHeartbeat = window.setInterval(() => {
      void checkAuthState({ silent: true });
    }, ADMIN_SESSION_HEARTBEAT_MS);

    return () => {
      window.clearInterval(sessionHeartbeat);
    };
  }, [checkAuthState]);

  const refreshSession = async ({ after }: { after?: () => Promise<void> } = {}) => {
    if (isRefreshingSession) {
      return;
    }

    setIsRefreshingSession(true);

    try {
      await checkAuthState();
      await after?.();
    } finally {
      setIsRefreshingSession(false);
    }
  };

  const logout = async ({ onLoggedOut }: { onLoggedOut?: () => void } = {}) => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    const result = await requestAdminJson(ADMIN_API_ENDPOINTS.auth, {
      method: "DELETE",
    });

    if (!result.ok) {
      setAuthStatus({
        text:
          result.errorCode === ADMIN_NETWORK_ERROR_CODE
            ? "Ошибка сети при завершении сессии."
            : "Не удалось завершить сессию. Попробуй снова.",
        tone: "error",
      });
    } else {
      setAuthState("locked");
      setAuthPassword("");
      onLoggedOut?.();
      setAuthStatus({
        text: "Сессия завершена.",
        tone: "info",
      });
    }

    setIsLoggingOut(false);
  };

  const submitUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authPassword.trim() || isUnlocking) {
      return;
    }

    setIsUnlocking(true);
    setAuthStatus({
      text: "Проверяю пароль...",
      tone: "info",
    });

    const result = await requestAdminJson<AuthResponse>(ADMIN_API_ENDPOINTS.auth, {
      body: { password: authPassword },
      method: "POST",
    });

    if (result.ok && result.data.authorized) {
      setAuthState("authorized");
      setAuthPassword("");
      setAuthStatus(null);
    } else {
      setAuthStatus({
        text:
          UNLOCK_ERROR_MESSAGES[result.errorCode] ??
          "Не удалось авторизоваться. Попробуй снова.",
        tone: "error",
      });
    }

    setIsUnlocking(false);
  };

  return {
    authPassword,
    authStatus,
    handleSessionExpired,
    isAuthorized,
    isChecking,
    isLoggingOut,
    isRefreshingSession,
    isUnlocking,
    logout,
    refreshSession,
    setAuthPassword,
    submitUnlock,
  };
};
