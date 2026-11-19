import { Check } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import styled, { css } from "styled-components";

import type { StatusMessage } from "../lib/admin.types";
import { useToast } from "./feedback";
import { Callout, focusVisible } from "./primitives";

/*
 * Form controls for every section: one height (40px, 44px on phones so iOS does
 * not zoom), one radius, one focus ring. Sections compose these instead of
 * styling their own inputs.
 */

const control = css`
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--a-border-strong);
  border-radius: var(--a-radius-sm);
  background-color: var(--a-surface);
  color: var(--a-ink);
  font: inherit;
  font-size: var(--a-text);
  transition: border-color 120ms ease;
  ${focusVisible}

  &::placeholder {
    color: var(--a-ink-3);
  }

  &:disabled {
    background-color: var(--a-surface-sunken);
    color: var(--a-ink-2);
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    min-height: 44px;
    font-size: 16px;
  }
`;

export const Input = styled.input`
  ${control}
`;

export const Select = styled.select`
  ${control}
  padding-right: 36px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23484848' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  cursor: pointer;
`;

export const Textarea = styled.textarea`
  ${control}
  min-height: 120px;
  padding: 10px 12px;
  line-height: 1.5;
  resize: vertical;
`;

/* align-content: a neighbour's hint makes the row taller, never this field's control. */
const FieldRoot = styled.div`
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;

  > label {
    color: var(--a-ink);
    font-size: var(--a-text-sm);
    font-weight: 600;
  }

  > small {
    color: var(--a-ink-3);
    font-size: var(--a-text-xs);
  }
`;

export const Field = ({
  children,
  hint,
  htmlFor,
  label,
}: {
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  label: ReactNode;
}) => (
  <FieldRoot>
    <label htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && <small>{hint}</small>}
  </FieldRoot>
);

/** Two columns where there is room, one on narrow screens. */
export const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;

  @container admin-content (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const FormActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

/* ---------- Switch ---------- */

/* The catalogue's original switch, kept on purpose: soft green when on, grey off. */
const SwitchTrack = styled.button<{ $on: boolean }>`
  position: relative;
  flex-shrink: 0;
  width: 42px;
  height: 24px;
  padding: 0;
  border: 1px solid
    ${({ $on }) => ($on ? "rgba(30, 108, 74, 0.32)" : "rgba(24, 24, 24, 0.14)")};
  border-radius: 999px;
  background: ${({ $on }) => ($on ? "rgba(30, 108, 74, 0.55)" : "rgba(24, 24, 24, 0.12)")};
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
  ${focusVisible}

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
    transform: translateX(${({ $on }) => ($on ? "18px" : "0")});
    transition: transform 0.2s ease;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    &::after {
      transition: none;
    }
  }
`;

export const Switch = ({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  /** Read by screen readers; the visible text sits next to the switch. */
  label: string;
  onChange: (checked: boolean) => void;
}) => (
  <SwitchTrack
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    $on={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  />
);

/* ---------- Checkbox ---------- */

const CheckRoot = styled.label<{ $boxed: boolean; $disabled: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.55 : 1)};
  font-size: var(--a-text);
  ${({ $boxed }) =>
    $boxed &&
    css`
      padding: 10px 12px;
      border: 1px solid var(--a-border);
      border-radius: var(--a-radius-sm);
      background: var(--a-surface);
    `}

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  [data-box] {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border: 1.5px solid var(--a-border-strong);
    border-radius: 5px;
    background: var(--a-surface);
    color: #fff;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  [data-box] svg {
    width: 13px;
    height: 13px;
    opacity: 0;
  }

  input:checked + [data-box] {
    border-color: var(--a-accent);
    background: var(--a-accent);
  }

  input:checked + [data-box] svg {
    opacity: 1;
  }

  input:focus-visible + [data-box] {
    box-shadow: var(--a-focus);
  }

  small {
    display: block;
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
  }

  > span:last-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

export const Checkbox = ({
  boxed = false,
  checked,
  description,
  disabled = false,
  label,
  onChange,
}: {
  boxed?: boolean;
  checked: boolean;
  description?: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  onChange: (checked: boolean) => void;
}) => (
  <CheckRoot $boxed={boxed} $disabled={disabled}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span data-box aria-hidden>
      <Check strokeWidth={3} />
    </span>
    <span>
      {label}
      {description && <small>{description}</small>}
    </span>
  </CheckRoot>
);

/* ---------- Segmented choice ---------- */

/* 40px tall like an input (44px on phones), and never stretched by a taller grid row. */
const ChoiceRoot = styled.div`
  display: inline-flex;
  align-self: start;
  justify-self: start;
  max-width: 100%;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--a-surface-hover);

  @container admin-content (max-width: 520px) {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    justify-self: stretch;
    border-radius: 14px;
  }
`;

const ChoiceOption = styled.label<{ $checked: boolean; $disabled: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: var(--a-text-sm);
  font-weight: 600;
  white-space: nowrap;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  background: ${({ $checked }) => ($checked ? "var(--a-surface)" : "transparent")};
  color: ${({ $checked }) => ($checked ? "var(--a-ink)" : "var(--a-ink-2)")};
  --choice-shadow: ${({ $checked }) => ($checked ? "var(--a-shadow)" : "0 0 #0000")};
  box-shadow: var(--choice-shadow);
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};
  transition:
    background-color 120ms ease,
    color 120ms ease;

  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  /* A thin ring inside the pill, so a focused option does not swell past the track. */
  &:has(input:focus-visible) {
    box-shadow:
      var(--choice-shadow),
      inset 0 0 0 2px var(--a-accent-ring);
  }

  @container admin-content (max-width: 520px) {
    border-radius: 11px;
  }

  @media (max-width: 640px) {
    min-height: 38px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/**
 * A short either/or (a language, a tariff) as one pill of radio buttons, the look
 * of SegmentedTabs: arrows move the choice, the form reads a real radio group.
 */
export const SegmentedChoice = <T extends string>({
  disabled = false,
  label,
  name,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  name: string;
  onChange: (value: T) => void;
  options: { label: ReactNode; value: T }[];
  value: T;
}) => (
  <ChoiceRoot role="radiogroup" aria-label={label}>
    {options.map((option) => (
      <ChoiceOption
        key={option.value}
        $checked={option.value === value}
        $disabled={disabled}
      >
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={option.value === value}
          disabled={disabled}
          onChange={() => onChange(option.value)}
        />
        {option.label}
      </ChoiceOption>
    ))}
  </ChoiceRoot>
);

/* ---------- Facts ---------- */

/** Label-over-value facts in even tiles ("Поток", "Старт", "Чат"). */
export const FactGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
  gap: 8px;
  margin: 0;

  > div {
    min-width: 0;
    padding: 10px 12px;
    border-radius: var(--a-radius-sm);
    background: var(--a-surface-sunken);
  }

  dt {
    color: var(--a-ink-2);
    font-size: var(--a-text-xs);
  }

  dd {
    margin: 2px 0 0;
    color: var(--a-ink);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
`;

export const Fact = ({ label, value }: { label: ReactNode; value: ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

const STATUS_TONES = {
  error: "danger",
  info: "info",
  success: "success",
} as const;

/* Each message object is shown once: a section that mounts again with the same
   status (the tab reopened, say) does not repeat an old toast. */
const shownStatuses = new WeakSet<object>();

/**
 * The result of an action — done, failed, skipped — as a toast, so nothing in the
 * layout jumps when it arrives. «Делаю…» (`progress`) shows nowhere: the busy
 * button already says it.
 */
export const StatusLine = ({ status }: { status: StatusMessage }) => {
  const toast = useToast();

  useEffect(() => {
    if (!status || status.tone === "progress" || shownStatuses.has(status)) return;
    shownStatuses.add(status);
    toast({ title: status.text, tone: STATUS_TONES[status.tone] });
  }, [status, toast]);

  return null;
};

/** A status that describes the screen itself (the login form, a lost session): stays in place. */
export const StatusCallout = ({ status }: { status: StatusMessage }) =>
  status && status.tone !== "progress" ? (
    <Callout tone={STATUS_TONES[status.tone]}>{status.text}</Callout>
  ) : null;
