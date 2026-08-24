"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS, ADMIN_SESSION_HEARTBEAT_MS } from "../lib/admin.constants";
import type { AuthResponse, AuthState, StatusMessage } from "../lib/admin.types";

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

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as AuthResponse;

        if (response.ok && data.authorized) {
          setAuthState("authorized");

          if (!silent) {
            setAuthStatus(null);
          }

          return;
        }

        setAuthState("locked");

        if (data.errorCode === "auth_not_configured") {
          setAuthStatus({
            text: "Не задан ADMIN_PASSWORD на сервере.",
            tone: "error",
          });
          return;
        }

        if (silent) {
          setAuthStatus({
            text: "Сессия завершена. Введи пароль снова.",
            tone: "info",
          });
          return;
        }

        setAuthStatus({
          text: "Введи пароль для доступа к админке.",
          tone: "info",
        });
      } catch {
        setAuthState("locked");
        setAuthStatus({
          text: "Не удалось проверить авторизацию. Попробуй обновить страницу.",
          tone: "error",
        });
      }
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

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
        method: "DELETE",
      });

      if (!response.ok) {
        setAuthStatus({
          text: "Не удалось завершить сессию. Попробуй снова.",
          tone: "error",
        });
        return;
      }

      setAuthState("locked");
      setAuthPassword("");
      onLoggedOut?.();
      setAuthStatus({
        text: "Сессия завершена.",
        tone: "info",
      });
    } catch {
      setAuthStatus({
        text: "Ошибка сети при завершении сессии.",
        tone: "error",
      });
    } finally {
      setIsLoggingOut(false);
    }
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

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.auth, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: authPassword,
        }),
      });
      const data = (await response.json()) as AuthResponse;

      if (response.ok && data.authorized) {
        setAuthState("authorized");
        setAuthPassword("");
        setAuthStatus(null);
        return;
      }

      if (data.errorCode === "invalid_password") {
        setAuthStatus({
          text: "Неверный пароль.",
          tone: "error",
        });
        return;
      }

      if (data.errorCode === "auth_not_configured") {
        setAuthStatus({
          text: "Не задан ADMIN_PASSWORD на сервере.",
          tone: "error",
        });
        return;
      }

      setAuthStatus({
        text: "Не удалось авторизоваться. Попробуй снова.",
        tone: "error",
      });
    } catch {
      setAuthStatus({
        text: "Ошибка сети при авторизации.",
        tone: "error",
      });
    } finally {
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
    isUnlocking,
    logout,
    refreshSession,
    setAuthPassword,
    submitUnlock,
  };
};
