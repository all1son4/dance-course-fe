import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import styled, { keyframes } from "styled-components";

import { adminTokens, type AdminTone, toneColors } from "../styles/tokens.styles";
import { AdminButton, focusVisible, IconButton } from "./primitives";

/* ---------- Toasts ---------- */

type Toast = {
  id: number;
  tone: Extract<AdminTone, "success" | "danger" | "info" | "warning">;
  title: string;
  description?: string;
};

type ToastInput = Omit<Toast, "id">;

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
`;

const ToastViewport = styled.div`
  ${adminTokens}
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 60;
  display: grid;
  gap: 8px;
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;

  @media (max-width: 640px) {
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
  }
`;

const ToastCard = styled.div<{ $tone: Toast["tone"] }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 10px 12px 14px;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
  background: var(--a-surface);
  box-shadow: var(--a-shadow-lg);
  pointer-events: auto;
  animation: ${slideIn} 180ms ease-out;

  > svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 1px;
    color: ${({ $tone }) => toneColors[$tone].color};
  }

  strong {
    display: block;
    font-size: var(--a-text);
  }

  p {
    margin: 2px 0 0;
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ToastIcon = ({ tone }: { tone: Toast["tone"] }) =>
  tone === "success" ? (
    <CircleCheck aria-hidden />
  ) : tone === "info" ? (
    <Info aria-hidden />
  ) : (
    <CircleAlert aria-hidden />
  );

/** Every confirmation and error of the admin lands here, whichever section raised it. */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { ...input, id }]);
      window.setTimeout(() => dismiss(id), input.tone === "danger" ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastViewport aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} $tone={toast.tone} role="status">
            <ToastIcon tone={toast.tone} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{toast.title}</strong>
              {toast.description && <p>{toast.description}</p>}
            </div>
            <IconButton
              type="button"
              aria-label="Закрыть уведомление"
              onClick={() => dismiss(toast.id)}
              style={{ width: 28, height: 28 }}
            >
              <X aria-hidden />
            </IconButton>
          </ToastCard>
        ))}
      </ToastViewport>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

/* ---------- Confirm dialog ---------- */

const Dialog = styled.dialog`
  width: min(520px, calc(100vw - 32px));
  max-height: min(86dvh, 760px);
  padding: 0;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius-lg);
  background: var(--a-surface);
  color: var(--a-ink);
  box-shadow: var(--a-shadow-lg);
  font-family: var(--a-font);
  overflow: hidden;

  &::backdrop {
    background: rgba(23, 21, 19, 0.42);
  }

  &[open] {
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 640px) {
    width: 100vw;
    max-width: 100vw;
    max-height: 92dvh;
    margin: auto 0 0;
    border-radius: var(--a-radius-lg) var(--a-radius-lg) 0 0;
  }
`;

const DialogBody = styled.div`
  display: grid;
  gap: 14px;
  padding: 20px 22px;
  overflow-y: auto;

  h2 {
    margin: 0;
    font-size: var(--a-text-lg);
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  > p {
    margin: 0;
    color: var(--a-ink-2);
  }
`;

const DialogFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--a-border);
  background: var(--a-surface-sunken);

  @media (max-width: 640px) {
    > button {
      flex: 1 1 140px;
    }
  }
`;

export const TextField = styled.input`
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--a-border-strong);
  border-radius: var(--a-radius-sm);
  background: var(--a-surface);
  color: var(--a-ink);
  font: inherit;
  ${focusVisible}

  &::placeholder {
    color: var(--a-ink-3);
  }

  @media (max-width: 640px) {
    min-height: 44px;
    font-size: 16px;
  }
`;

export const FieldLabel = styled.label`
  display: grid;
  gap: 6px;
  font-size: var(--a-text-sm);
  font-weight: 600;
  color: var(--a-ink);
`;

/**
 * A modal confirmation for actions that cannot be undone. `requireText` asks the
 * operator to type a name first (HUB-D20), so a slip of the finger cannot close a
 * cohort or send a mailing.
 */
export const ConfirmDialog = ({
  busy = false,
  children,
  confirmDisabled = false,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  requireText,
  title,
  tone = "primary",
}: {
  busy?: boolean;
  children?: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel: string;
  description?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  requireText?: string;
  title: string;
  tone?: "primary" | "danger";
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTyped("");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const matches = useMemo(
    () =>
      !requireText ||
      typed.replace(/\s+/g, " ").trim() === requireText.replace(/\s+/g, " ").trim(),
    [requireText, typed],
  );

  return (
    <Dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onCancel();
      }}
    >
      <DialogBody>
        <h2 id={titleId}>{title}</h2>
        {description && <p>{description}</p>}
        {children}
        {requireText && (
          <FieldLabel>
            Для подтверждения введи «{requireText}»
            <TextField
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </FieldLabel>
        )}
      </DialogBody>
      <DialogFooter>
        <AdminButton onClick={onCancel} disabled={busy}>
          Отмена
        </AdminButton>
        <AdminButton
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          loading={busy}
          disabled={!matches || confirmDisabled}
        >
          {confirmLabel}
        </AdminButton>
      </DialogFooter>
    </Dialog>
  );
};
