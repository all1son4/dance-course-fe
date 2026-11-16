import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import styled from "styled-components";

import type { StatusMessage } from "../lib/admin.types";
import { adminTokens } from "../styles/tokens.styles";
import { FieldLabel, TextField } from "../ui/feedback";
import { AdminButton, Callout, IconButton } from "../ui/primitives";
import { useSiteHost } from "../ui/use-site-host";

const Page = styled.main`
  ${adminTokens}
  flex-shrink: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
  background:
    radial-gradient(60rem 30rem at 0% 0%, rgba(124, 0, 2, 0.06), transparent 60%),
    var(--a-canvas);
`;

const Card = styled.div`
  width: min(400px, 100%);
  padding: 28px;
  border: 1px solid var(--a-border);
  border-radius: 20px;
  background: var(--a-surface);
  box-shadow: var(--a-shadow-lg);

  @media (max-width: 480px) {
    padding: 22px 18px;
  }
`;

const Mark = styled.div`
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 18px;
  border-radius: 12px;
  background: var(--a-accent);
  color: #fff;
  font-weight: 800;
  letter-spacing: 0.02em;
`;

const Heading = styled.h1`
  margin: 0;
  font-size: var(--a-text-xl);
  font-weight: 700;
  letter-spacing: -0.02em;
`;

const Lead = styled.p`
  margin: 6px 0 22px;
  color: var(--a-ink-2);
`;

// The label holds only its word, so the field is named «Пароль» and the eye button
// keeps its own name.
const PasswordField = styled.div`
  display: grid;
  gap: 6px;
`;

const PasswordWrap = styled.div`
  position: relative;

  input {
    padding-right: 48px;
  }

  button {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
  }
`;

const Form = styled.form`
  display: grid;
  gap: 14px;
`;

const Hint = styled.p`
  margin: 0;
  color: var(--a-warning);
  font-size: var(--a-text-sm);
`;

const Footer = styled.p`
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 18px 0 0;
  color: var(--a-ink-3);
  font-size: var(--a-text-xs);

  svg {
    width: 13px;
    height: 13px;
  }
`;

type LoginScreenProps = {
  authPassword: string;
  authStatus: StatusMessage;
  isChecking: boolean;
  isSessionCheckUnavailable: boolean;
  isUnlocking: boolean;
  onPasswordChange: (value: string) => void;
  onRetrySessionCheck: () => void | Promise<unknown>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export const LoginScreen = ({
  authPassword,
  authStatus,
  isChecking,
  isSessionCheckUnavailable,
  isUnlocking,
  onPasswordChange,
  onRetrySessionCheck,
  onSubmit,
}: LoginScreenProps) => {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const busy = isChecking || isUnlocking;
  const host = useSiteHost();
  const onKey = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState?.("CapsLock") ?? false);

  return (
    <Page>
      <Card>
        <Mark aria-hidden>AS</Mark>
        <Heading>Центр управления</Heading>
        <Lead>Anna Strok · продажи, потоки и доступы</Lead>
        <Form onSubmit={onSubmit}>
          <PasswordField>
            <FieldLabel htmlFor="admin-password">Пароль</FieldLabel>
            <PasswordWrap>
              <TextField
                id="admin-password"
                name="adminPassword"
                type={visible ? "text" : "password"}
                value={authPassword}
                onChange={(event) => onPasswordChange(event.target.value)}
                onKeyDown={onKey}
                onKeyUp={onKey}
                disabled={busy}
                autoComplete="current-password"
                enterKeyHint="go"
                autoFocus
              />
              <IconButton
                type="button"
                aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
                aria-pressed={visible}
                onClick={() => setVisible((current) => !current)}
              >
                {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </IconButton>
            </PasswordWrap>
          </PasswordField>
          {capsLock && <Hint>Включён Caps Lock</Hint>}
          <AdminButton
            type="submit"
            variant="primary"
            fullWidth
            loading={isUnlocking}
            disabled={busy || !authPassword.trim()}
          >
            {isChecking ? "Проверяю сессию…" : isUnlocking ? "Вхожу…" : "Войти"}
          </AdminButton>
          {authStatus && (
            <Callout
              tone={
                authStatus.tone === "error"
                  ? "danger"
                  : authStatus.tone === "success"
                    ? "success"
                    : "info"
              }
            >
              {authStatus.text}
            </Callout>
          )}
          {isSessionCheckUnavailable && (
            <AdminButton
              onClick={() => void onRetrySessionCheck()}
              disabled={busy}
              fullWidth
            >
              Проверить сессию ещё раз
            </AdminButton>
          )}
        </Form>
        {host && (
          <Footer>
            <LockKeyhole aria-hidden />
            {host}
          </Footer>
        )}
      </Card>
    </Page>
  );
};
