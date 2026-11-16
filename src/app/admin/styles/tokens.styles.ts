import { css } from "styled-components";

/**
 * The control centre's design tokens, scoped to the admin root. The palette is
 * the public site's own: white surfaces on its light grey, near-black text, its
 * #484848 secondary grey and the brand wine for the one primary action and the
 * active section. Status tones pair a soft fill with readable text.
 */
export const adminTokens = css`
  --a-font: var(--font-manrope), system-ui, -apple-system, "Segoe UI", sans-serif;
  --a-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  --a-canvas: #f4f5f6;
  --a-surface: #ffffff;
  --a-surface-sunken: #f7f8f9;
  --a-surface-hover: #eff0f2;
  --a-border: rgba(0, 0, 0, 0.08);
  --a-border-strong: rgba(0, 0, 0, 0.14);

  --a-ink: #0b0b0b;
  --a-ink-2: #484848;
  --a-ink-3: #767676;

  --a-accent: #7c0002;
  --a-accent-hover: #5f0002;
  --a-accent-soft: rgba(124, 0, 2, 0.06);
  --a-accent-ring: rgba(124, 0, 2, 0.24);

  --a-success: #18703a;
  --a-success-soft: #e9f4ed;
  --a-warning: #8a5300;
  --a-warning-soft: #fdf3e2;
  --a-danger: #c00004;
  --a-danger-soft: #fdeceb;
  --a-info: #2b4a6f;
  --a-info-soft: #edf1f6;

  --a-radius-sm: 10px;
  --a-radius: 14px;
  --a-radius-lg: 18px;
  --a-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.03);
  --a-shadow-lg: 0 20px 56px rgba(0, 0, 0, 0.14), 0 4px 14px rgba(0, 0, 0, 0.06);
  --a-focus: 0 0 0 3px var(--a-accent-ring);

  --a-text-xs: 12px;
  --a-text-sm: 13px;
  --a-text: 14px;
  --a-text-md: 15px;
  --a-text-lg: 18px;
  --a-text-xl: 22px;
  --a-text-2xl: 28px;

  --a-sidebar-width: 252px;
  --a-topbar-height: 60px;

  font-family: var(--a-font);
  font-size: var(--a-text);
  line-height: 1.5;
  color: var(--a-ink);
  background: var(--a-canvas);
  -webkit-font-smoothing: antialiased;
`;

export type AdminTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/** Soft fill and readable text for a status tone. */
export const toneColors: Record<AdminTone, { background: string; color: string }> = {
  accent: { background: "var(--a-accent-soft)", color: "var(--a-accent)" },
  danger: { background: "var(--a-danger-soft)", color: "var(--a-danger)" },
  info: { background: "var(--a-info-soft)", color: "var(--a-info)" },
  neutral: { background: "var(--a-surface-sunken)", color: "var(--a-ink-2)" },
  success: { background: "var(--a-success-soft)", color: "var(--a-success)" },
  warning: { background: "var(--a-warning-soft)", color: "var(--a-warning)" },
};
