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

/* A manual popover lives in the top layer, so a toast raised while a dialog is
   open shows above its backdrop; the UA popover box styles are reset here. */
const ToastViewport = styled.div`
  ${adminTokens}
  position: fixed;
  inset: auto 20px 20px auto;
  height: auto;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: visible;
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
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof viewport.showPopover !== "function") return;
    const isOpen = viewport.matches(":popover-open");
    if (toasts.length === 0) {
      if (isOpen) viewport.hidePopover();
      return;
    }
    // A dialog opened after the toasts sits above them: enter the top layer again.
    if (isOpen && document.querySelector("dialog:modal")) viewport.hidePopover();
    if (!viewport.matches(":popover-open")) viewport.showPopover();
  }, [toasts]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      // The same message already on screen is not stacked a second time; its
      // timer below then dismisses an id that never existed, which is a no-op.
      setToasts((current) =>
        current.some((toast) => toast.title === input.title && toast.tone === input.tone)
          ? current
          : [...current.slice(-3), { ...input, id }],
      );
      // A problem stays until it is closed: it usually says what to do next, and
      // it must not vanish while the admin is still reading the window behind it.
      if (input.tone !== "danger") window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastViewport
        ref={viewportRef}
        popover="manual"
        aria-live="polite"
        aria-relevant="additions"
      >
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

const Dialog = styled.dialog<{ $wide?: boolean }>`
  width: min(${({ $wide }) => ($wide ? "760px" : "520px")}, calc(100vw - 32px));
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

  // Letter case and extra spaces do not matter: the text only proves intent.
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  const matches = useMemo(
    () => !requireText || normalize(typed) === normalize(requireText),
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
            {typed.trim() && !matches && <small>Название не совпадает.</small>}
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

/**
 * A plain window for a task with its own steps or form (no confirm button of its
 * own): Escape, the backdrop and «Закрыть» close it.
 */
export const SheetDialog = ({
  children,
  footer,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <Dialog
      ref={ref}
      $wide
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <DialogBody>
        <h2 id={titleId}>{title}</h2>
        {children}
      </DialogBody>
      <DialogFooter>
        {footer}
        <AdminButton onClick={onClose}>Закрыть</AdminButton>
      </DialogFooter>
    </Dialog>
  );
};
