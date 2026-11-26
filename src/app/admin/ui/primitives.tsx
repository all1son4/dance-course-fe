import { ChevronDown, LoaderCircle } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import styled, { css, keyframes } from "styled-components";

import { gridRowReveal } from "@/styles/mixins/motion";

import { type AdminTone, toneColors } from "../styles/tokens.styles";

const spin = keyframes`to { transform: rotate(360deg); }`;
const pulse = keyframes`50% { opacity: 0.45; }`;

export const focusVisible = css`
  &:focus-visible {
    outline: none;
    box-shadow: var(--a-focus);
  }
`;

/* ---------- Button ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantStyles: Record<ButtonVariant, ReturnType<typeof css>> = {
  danger: css`
    background: var(--a-danger);
    color: #fff;
    border-color: transparent;
    &:hover:not(:disabled) {
      filter: brightness(0.92);
    }
  `,
  ghost: css`
    background: transparent;
    color: var(--a-ink-2);
    border-color: transparent;
    &:hover:not(:disabled) {
      background: var(--a-surface-hover);
      color: var(--a-ink);
    }
  `,
  primary: css`
    background: var(--a-accent);
    color: #fff;
    border-color: transparent;
    &:hover:not(:disabled) {
      background: var(--a-accent-hover);
    }
  `,
  secondary: css`
    background: var(--a-surface);
    color: var(--a-ink);
    border-color: var(--a-border-strong);
    &:hover:not(:disabled) {
      background: var(--a-surface-hover);
    }
  `,
};

const StyledButton = styled.button<{
  $variant: ButtonVariant;
  $size: "sm" | "md";
  $full: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex-shrink: 0;
  width: ${({ $full }) => ($full ? "100%" : "auto")};
  min-height: ${({ $size }) => ($size === "sm" ? "32px" : "40px")};
  padding: ${({ $size }) => ($size === "sm" ? "0 14px" : "0 18px")};
  border: 1px solid transparent;
  border-radius: 999px;
  font: inherit;
  font-size: ${({ $size }) => ($size === "sm" ? "var(--a-text-sm)" : "var(--a-text)")};
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    filter 140ms ease;
  ${({ $variant }) => variantStyles[$variant]}
  ${focusVisible}

  svg {
    width: ${({ $size }) => ($size === "sm" ? "15px" : "17px")};
    height: ${({ $size }) => ($size === "sm" ? "15px" : "17px")};
    flex-shrink: 0;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &[aria-busy="true"] svg[data-spinner] {
    animation: ${spin} 900ms linear infinite;
  }

  @media (max-width: 640px) {
    min-height: ${({ $size }) => ($size === "sm" ? "36px" : "44px")};
  }
`;

type AdminButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children?: ReactNode;
  fullWidth?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  size?: "sm" | "md";
  variant?: ButtonVariant;
};

export const AdminButton = ({
  children,
  fullWidth = false,
  icon,
  loading = false,
  size = "md",
  type = "button",
  variant = "secondary",
  disabled,
  ...rest
}: AdminButtonProps) => (
  <StyledButton
    $full={fullWidth}
    $size={size}
    $variant={variant}
    aria-busy={loading || undefined}
    disabled={disabled || loading}
    type={type}
    {...rest}
  >
    {loading ? <LoaderCircle aria-hidden data-spinner /> : icon}
    {children}
  </StyledButton>
);

export const IconButton = styled.button`
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--a-ink-2);
  cursor: pointer;
  transition: background-color 140ms ease;
  ${focusVisible}

  &:hover:not(:disabled) {
    background: var(--a-surface-hover);
    color: var(--a-ink);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  svg {
    width: 18px;
    height: 18px;
  }

  &[aria-busy="true"] svg {
    animation: ${spin} 900ms linear infinite;
  }

  @media (max-width: 640px) {
    width: 42px;
    height: 42px;
  }
`;

/* ---------- Badge ---------- */

export const Badge = styled.span<{ $tone?: AdminTone }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: var(--a-text-xs);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  background: ${({ $tone = "neutral" }) => toneColors[$tone].background};
  color: ${({ $tone = "neutral" }) => toneColors[$tone].color};

  svg {
    width: 13px;
    height: 13px;
  }
`;

/* ---------- Panel ---------- */

const PanelRoot = styled.section<{ $flush: boolean }>`
  min-width: 0;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius-lg);
  background: var(--a-surface);
  box-shadow: var(--a-shadow);
  padding: ${({ $flush }) => ($flush ? "0" : "18px 20px 20px")};

  @media (max-width: 640px) {
    border-radius: var(--a-radius);
    padding: ${({ $flush }) => ($flush ? "0" : "16px")};
  }
`;

const PanelHead = styled.header<{ $flush: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 16px;
  margin-bottom: 14px;
  padding: ${({ $flush }) => ($flush ? "18px 20px 0" : "0")};

  @media (max-width: 640px) {
    padding: ${({ $flush }) => ($flush ? "16px 16px 0" : "0")};
  }
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: var(--a-text-md);
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;
`;

const PanelDescription = styled.p`
  margin: 3px 0 0;
  font-size: var(--a-text-sm);
  color: var(--a-ink-2);
`;

/** A title with a small control right after it (a «?» button, say). */
const PanelTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;

  > button {
    margin: -6px 0;
  }
`;

const PanelActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

export const Panel = ({
  actions,
  children,
  description,
  flush = false,
  id,
  title,
  titleAction,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  flush?: boolean;
  id?: string;
  title?: ReactNode;
  /** Sits right after the title, outside the heading itself. */
  titleAction?: ReactNode;
}) => (
  <PanelRoot
    $flush={flush}
    id={id}
    aria-label={typeof title === "string" ? title : undefined}
  >
    {(title || actions) && (
      <PanelHead $flush={flush}>
        <div>
          {title && titleAction ? (
            <PanelTitleRow>
              <PanelTitle>{title}</PanelTitle>
              {titleAction}
            </PanelTitleRow>
          ) : (
            title && <PanelTitle>{title}</PanelTitle>
          )}
          {description && <PanelDescription>{description}</PanelDescription>}
        </div>
        {actions && <PanelActions>{actions}</PanelActions>}
      </PanelHead>
    )}
    {children}
  </PanelRoot>
);

/* ---------- Disclosure ---------- */

const DisclosureRoot = styled.div`
  & + & {
    border-top: 1px solid var(--a-border);
  }
`;

const DisclosureButton = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% + 20px);
  margin: 0 -10px;
  padding: 12px 10px;
  border: 0;
  border-radius: var(--a-radius-sm);
  background: transparent;
  color: var(--a-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 140ms ease;
  ${focusVisible}

  &:hover {
    background: var(--a-surface-hover);
  }

  > span {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    min-width: 0;
  }

  strong {
    font-size: var(--a-text);
    font-weight: 600;
  }

  small {
    color: var(--a-ink-3);
    font-size: var(--a-text-sm);
  }

  /* A journal row: who and what on the left, one column of states on the right. */
  &[data-aside] {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 18px;
    align-items: center;

    > span:first-child {
      flex-direction: column;
      align-items: flex-start;
    }

    > [data-row-aside] {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      max-width: 280px;
      text-align: right;
    }

    @container admin-content (max-width: 560px) {
      grid-template-columns: minmax(0, 1fr) 18px;

      > [data-row-aside] {
        grid-row: 2;
        grid-column: 1;
        flex-flow: row wrap;
        align-items: center;
        max-width: none;
        text-align: left;
      }

      > svg {
        grid-row: 1 / span 2;
        grid-column: 2;
      }
    }
  }

  > svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    color: var(--a-ink-2);
    transform: rotate(${({ $open }) => ($open ? "180deg" : "0deg")});
    transition: transform var(--motion-base, 220ms) var(--ease-emphasized, ease);
  }
`;

/* The row's track glides between 0fr and 1fr; the content fades with it. The
   4px side padding keeps the focus rings of full-width fields from being clipped. */
const DisclosureRegion = styled.div<{ $open: boolean }>`
  ${({ $open }) => gridRowReveal($open)}

  & > * {
    margin: 0 -4px;
    padding: 0 4px;
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);
    transition-delay: ${({ $open }) => ($open ? "var(--motion-settle, 40ms)" : "0ms")};
  }
`;

const DisclosureBody = styled.div`
  padding: 6px 0 18px;
`;

/**
 * A full-width row that opens a rarely used block under it. The content stays
 * mounted while closed (inert, so neither Tab nor a screen reader reaches it):
 * a half-typed form or a result survives closing, and nothing ever collapses
 * on its own.
 */
export const Disclosure = ({
  aside,
  children,
  defaultOpen = false,
  hint,
  title,
}: {
  /** The row's states, in one right-hand column (journals). */
  aside?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  hint?: ReactNode;
  title: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <DisclosureRoot>
      <DisclosureButton
        type="button"
        id={`${id}-button`}
        aria-controls={id}
        aria-expanded={open}
        $open={open}
        data-aside={aside ? "" : undefined}
        onClick={() => setOpen(!open)}
      >
        <span>
          <strong>{title}</strong>
          {hint && <small>{hint}</small>}
        </span>
        {aside && <span data-row-aside>{aside}</span>}
        <ChevronDown aria-hidden />
      </DisclosureButton>
      <DisclosureRegion
        id={id}
        role="region"
        aria-labelledby={`${id}-button`}
        $open={open}
        inert={!open}
      >
        <div>
          <DisclosureBody>{children}</DisclosureBody>
        </div>
      </DisclosureRegion>
    </DisclosureRoot>
  );
};

/* ---------- Page header ---------- */

const HeaderRoot = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "title actions"
    "description description";
  align-items: center;
  gap: 6px 16px;

  > h1 {
    grid-area: title;
  }

  > p {
    grid-area: description;
  }

  > div {
    grid-area: actions;
  }
`;

const HeaderTitle = styled.h1`
  margin: 0;
  font-size: var(--a-text-2xl);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;

  @media (max-width: 640px) {
    font-size: var(--a-text-xl);
  }
`;

const HeaderDescription = styled.p`
  max-width: 640px;
  margin: 0;
  color: var(--a-ink-2);
  font-size: var(--a-text-md);
`;

export const PageHeader = ({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}) => (
  <HeaderRoot>
    <HeaderTitle>{title}</HeaderTitle>
    {actions && <PanelActions>{actions}</PanelActions>}
    {description && <HeaderDescription>{description}</HeaderDescription>}
  </HeaderRoot>
);

/* ---------- Stat tile ---------- */

const TileRoot = styled.div<{ $interactive: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius-lg);
  background: var(--a-surface);
  box-shadow: var(--a-shadow);
  text-align: left;

  @container admin-content (max-width: 520px) {
    padding: 14px;
  }
  font: inherit;
  color: inherit;
  ${({ $interactive }) =>
    $interactive &&
    css`
      cursor: pointer;
      transition: border-color 140ms ease;
      &:hover {
        border-color: var(--a-border-strong);
      }
    `}
  ${focusVisible}
`;

const TileLabel = styled.span`
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);
  font-weight: 500;
  line-height: 1.4;

  svg {
    width: 15px;
    height: 15px;
    margin-top: 2px;
    flex-shrink: 0;
  }
`;

const TileValue = styled.span`
  font-size: var(--a-text-2xl);

  @container admin-content (max-width: 520px) {
    font-size: var(--a-text-xl);
  }

  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
`;

const TileHint = styled.span<{ $tone?: AdminTone }>`
  font-size: var(--a-text-sm);
  color: ${({ $tone }) => ($tone ? toneColors[$tone].color : "var(--a-ink-3)")};
`;

export const StatTile = ({
  hint,
  hintTone,
  icon,
  label,
  onClick,
  value,
}: {
  hint?: ReactNode;
  hintTone?: AdminTone;
  icon?: ReactNode;
  label: ReactNode;
  onClick?: () => void;
  value: ReactNode;
}) => (
  <TileRoot
    $interactive={Boolean(onClick)}
    as={onClick ? "button" : "div"}
    onClick={onClick}
    type={onClick ? "button" : undefined}
  >
    <TileLabel>
      {icon}
      {label}
    </TileLabel>
    <TileValue>{value}</TileValue>
    {hint && <TileHint $tone={hintTone}>{hint}</TileHint>}
  </TileRoot>
);

/**
 * Stat tiles in even rows: four across on wide screens, two on tablets and
 * phones, so a row never leaves one tile hanging on its own.
 */
export const TileGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @container admin-content (max-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

/* ---------- Empty state, callout, skeleton ---------- */

const EmptyRoot = styled.div`
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 28px 16px;
  text-align: center;
  color: var(--a-ink-2);

  svg {
    width: 26px;
    height: 26px;
    color: var(--a-ink-3);
    margin-bottom: 4px;
  }

  strong {
    color: var(--a-ink);
    font-size: var(--a-text-md);
  }

  p {
    max-width: 420px;
    margin: 0;
    font-size: var(--a-text-sm);
  }
`;

export const EmptyState = ({
  action,
  icon,
  text,
  title,
}: {
  action?: ReactNode;
  icon?: ReactNode;
  text?: ReactNode;
  title: ReactNode;
}) => (
  <EmptyRoot>
    {icon}
    <strong>{title}</strong>
    {text && <p>{text}</p>}
    {action && <div style={{ marginTop: 8 }}>{action}</div>}
  </EmptyRoot>
);

const CalloutRoot = styled.div<{ $tone: AdminTone }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: var(--a-radius);
  background: ${({ $tone }) => toneColors[$tone].background};
  color: var(--a-ink);
  font-size: var(--a-text-sm);

  > svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 1px;
    color: ${({ $tone }) => toneColors[$tone].color};
  }

  strong {
    display: block;
    margin-bottom: 2px;
    color: ${({ $tone }) => toneColors[$tone].color};
  }
`;

export const Callout = ({
  children,
  icon,
  title,
  tone = "info",
}: {
  children?: ReactNode;
  icon?: ReactNode;
  title?: ReactNode;
  tone?: AdminTone;
}) => (
  <CalloutRoot $tone={tone} role={tone === "danger" ? "alert" : "status"}>
    {icon}
    <div>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  </CalloutRoot>
);

export const Skeleton = styled.div<{ $height?: number; $width?: string }>`
  height: ${({ $height = 14 }) => $height}px;
  width: ${({ $width = "100%" }) => $width};
  border-radius: 6px;
  background: var(--a-surface-hover);
  animation: ${pulse} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/* ---------- Segmented tabs ---------- */

const TabsRoot = styled.div`
  display: inline-flex;
  justify-self: start;
  max-width: 100%;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--a-surface-hover);

  /* Phones: an even grid instead of a strip that would scroll out of view. */
  @container admin-content (max-width: 520px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    /* An odd last item takes the whole row instead of hanging alone. */
    & > :last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }
    justify-self: stretch;
    border-radius: 14px;

    > button {
      justify-content: center;
      border-radius: 11px;
    }
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: var(--a-text-sm);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  background: ${({ $active }) => ($active ? "var(--a-surface)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--a-ink)" : "var(--a-ink-2)")};
  box-shadow: ${({ $active }) => ($active ? "var(--a-shadow)" : "none")};
  ${focusVisible}

  @media (max-width: 640px) {
    min-height: 38px;
  }
`;

export const SegmentedTabs = <T extends string>({
  items,
  label,
  onChange,
  value,
}: {
  items: { id: T; label: ReactNode; count?: number }[];
  label: string;
  onChange: (value: T) => void;
  value: T;
}) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next]!.id);
  };

  return (
    <TabsRoot role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <Tab
          key={item.id}
          ref={(element) => {
            refs.current[index] = element;
          }}
          id={`${baseId}-${item.id}`}
          role="tab"
          type="button"
          aria-selected={item.id === value}
          tabIndex={item.id === value ? 0 : -1}
          $active={item.id === value}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {item.label}
          {item.count ? <Badge $tone="danger">{item.count}</Badge> : null}
        </Tab>
      ))}
    </TabsRoot>
  );
};

/* ---------- Layout helpers ---------- */

export const Stack = styled.div<{ $gap?: number }>`
  display: grid;
  gap: ${({ $gap = 16 }) => $gap}px;
  min-width: 0;
`;

export const Row = styled.div<{ $gap?: number; $wrap?: boolean; $justify?: string }>`
  display: flex;
  align-items: center;
  flex-wrap: ${({ $wrap = true }) => ($wrap ? "wrap" : "nowrap")};
  justify-content: ${({ $justify = "flex-start" }) => $justify};
  gap: ${({ $gap = 8 }) => $gap}px;
  min-width: 0;
`;

export const Muted = styled.span`
  color: var(--a-ink-2);
`;

/** A secondary line under a heading: who, when, what for. */
export const Meta = styled.p`
  margin: 0;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);
  overflow-wrap: anywhere;
`;

/** A link-looking button that sits inside a sentence, on its baseline. */
export const TextButton = styled.button`
  display: inline;
  padding: 0;
  border: 0;
  background: none;
  color: var(--a-accent);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  ${focusVisible}

  &:hover {
    color: var(--a-accent-hover);
  }
`;

/** Small grey help text under a control. */
export const FieldNote = styled.p`
  margin: 0;
  max-width: 560px;
  color: var(--a-ink-3);
  font-size: var(--a-text-xs);
  line-height: 1.45;
`;

export const Mono = styled.span`
  font-family: var(--a-mono);
  font-size: var(--a-text-xs);
  color: var(--a-ink-2);
  overflow-wrap: anywhere;
`;

const HandleAnchor = styled.a`
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--a-border-strong);
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  ${focusVisible}

  &:hover {
    color: var(--a-accent);
  }
`;

/** A buyer's social handle as a link to the profile: Instagram, or Telegram where that is all we have. */
export const HandleLink = ({
  handle,
  network,
}: {
  handle: string;
  network: "instagram" | "telegram";
}) => {
  const name = handle.trim().replace(/^@+/u, "");
  const href =
    network === "instagram"
      ? `https://www.instagram.com/${encodeURIComponent(name)}/`
      : `https://t.me/${encodeURIComponent(name)}`;

  return (
    <HandleAnchor
      href={href}
      target="_blank"
      rel="noreferrer"
      title={network === "instagram" ? "Профиль в Instagram" : "Профиль в Telegram"}
    >
      @{name}
    </HandleAnchor>
  );
};
