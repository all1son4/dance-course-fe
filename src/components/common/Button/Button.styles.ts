import Link from "next/link";
import styled, { css } from "styled-components";

import { Ring } from "@/components/common/Spinner/Spinner.styles";
import { glass } from "@/styles/mixins/glass";

import type { ButtonFrost, ButtonSize, ButtonVariant } from "./Button.types";

type StyledProps = {
  $variant: ButtonVariant;
  $size: ButtonSize;
  $width: string;
  $frost: ButtonFrost;
};

type ControlProps = StyledProps & {
  $isLoading?: boolean;
};

const sizeStyles = {
  lg: css`
    min-height: 56px;
    font-size: var(--text-lead);
    font-weight: 400;
    box-sizing: border-box;
  `,
  sm: css`
    min-height: 44px;
    font-size: var(--text-body-sm);
    font-weight: 400;
    box-sizing: border-box;
  `,
} satisfies Record<ButtonSize, ReturnType<typeof css>>;

const buildVariantStyles = (frost: ButtonFrost) => ({
  primary: css`
    ${glass({
      variant: "control",
      frost,
      radius: "var(--radius-slab)",
      bgParam: "rgba(124, 0, 2, 1)",
      fillPercent: 100,
      elevation: 1.9,
    })}
    color: var(--ink-inverse);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        ${glass({
          variant: "control",
          frost,
          radius: "var(--radius-slab)",
          bgParam: "rgba(11, 11, 11, 1)",
          fillPercent: 100,
          elevation: 1.9,
        })}
      }
    }
  `,
  /* Solid white face, but it darkens on hover exactly like `secondary`. */
  white: css`
    ${glass({
      variant: "control",
      frost,
      radius: "var(--radius-slab)",
      bgParam: "rgba(255, 255, 255, 1)",
      fillPercent: 100,
      elevation: 1.9,
    })}
    color: var(--ink);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        ${glass({
          variant: "control",
          frost,
          radius: "var(--radius-slab)",
          bgParam: "rgba(11, 11, 11, 1)",
          fillPercent: 100,
          elevation: 1.9,
        })}
        color: var(--ink-inverse);
      }
    }
  `,
  secondary: css`
    ${glass({
      variant: "control",
      frost,
      radius: "var(--radius-slab)",
      elevation: 1.9,
    })}
    color: var(--ink);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        ${glass({
          variant: "control",
          frost,
          radius: "var(--radius-slab)",
          bgParam: "rgba(11, 11, 11, 1)",
          fillPercent: 100,
          elevation: 1.9,
        })}
        color: var(--ink-inverse);
      }
    }
  `,
  ghost: css`
    /* Sits on dark, strongly tinted panels: no saturation boost (it would make
       the tint glow) and dark-tone fallbacks so the white label stays readable
       when the backdrop filter is unavailable or transparency is reduced. */
    ${glass({
      variant: "control",
      tone: "dark",
      frost: "static",
      radius: "var(--radius-slab)",
      bgParam: "rgba(255, 255, 255, 0.14)",
      frostPx: 8,
      saturatePercent: 100,
      contrastPercent: 100,
      shadowStrength: 0.7,
    })}
    color: var(--ink-inverse);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        ${glass({
          variant: "control",
          tone: "dark",
          frost: "static",
          radius: "var(--radius-slab)",
          bgParam: "rgba(255, 255, 255, 0.46)",
          frostPx: 8,
          saturatePercent: 100,
          contrastPercent: 100,
          shadowStrength: 0.7,
        })}
        color: var(--ink-inverse);
      }
    }
  `,
});

const variantStyles = {
  static: buildVariantStyles("static"),
  live: buildVariantStyles("live"),
} satisfies Record<ButtonFrost, ReturnType<typeof buildVariantStyles>>;

const controlStyles = css<ControlProps>`
  appearance: none;
  border: none;
  padding: 14px 40px;

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  text-align: center;
  text-decoration: none !important;
  position: relative;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 1;
  min-width: 44px;
  min-height: 44px;

  ${({ $size }) => sizeStyles[$size]};
  width: 100%;
  max-width: ${({ $width }) => $width};

  ${({ $frost, $variant }) => variantStyles[$frost][$variant]};

  /* glass() transitions only background-color/box-shadow on the same tokens;
     the button adds transform/color/filter/opacity on top, so it restates the
     whole list after the variant styles. */
  transition:
    transform var(--motion-fast, 160ms) var(--ease-standard, ease),
    color var(--motion-base, 220ms) var(--ease-standard, ease),
    background-color var(--motion-base, 220ms) var(--ease-standard, ease),
    box-shadow var(--motion-base, 220ms) var(--ease-standard, ease),
    filter var(--motion-fast, 160ms) var(--ease-standard, ease),
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease);

  ${({ $isLoading }) =>
    $isLoading &&
    css`
      pointer-events: none;
    `}

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
  }

  @media (hover: none) and (pointer: coarse) {
    &:active:not(:disabled) {
      transform: scale(0.985);
      filter: brightness(0.95);
      opacity: 0.98;
    }
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 520px) {
    padding: 14px 24px;
    line-height: 1.25;
  }
`;

export const ButtonLinkWrapper = styled(Link)<ControlProps>`
  ${controlStyles}
`;

export const ButtonAnchorWrapper = styled.a<ControlProps>`
  ${controlStyles}
`;

export const StyledButton = styled.button<ControlProps>`
  ${controlStyles}
`;

/*
 * Loading keeps the label and adds the ring beside it, softly. The ring lives
 * in a slot that opens from 0 to its width over the emphasized curve: in a
 * button with room to spare the centred label glides a few pixels left; a
 * button sized to its content grows by the same amount, just as smoothly.
 * Nothing changes in one frame, and the button's height never changes.
 */
export const ButtonContent = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1em;
`;

/* One grid cell for the label and its optional loading text, so a longer
   "Processing..." never widens the button when it takes over. */
export const ButtonLabel = styled.span`
  display: inline-grid;
  place-items: center;
`;

export const ButtonLabelText = styled.span<{ $isHidden?: boolean }>`
  grid-area: 1 / 1;
  opacity: ${({ $isHidden }) => ($isHidden ? 0 : 1)};
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);
`;

/* Ring geometry per button size. The Ring declares its own 20px defaults on
   the element, so these must be set on the ring itself (below), not inherited
   from the slot; the slot only needs the size for its width and height. */
/* The dot rides on the ring's own track (orbit = radius minus half the
   stroke): at this size a satellite outside the ring reads as a stray speck. */
const ringBySize = {
  lg: { size: "14px", stroke: "1.6px", dot: "2.8px", orbit: "6.2px" },
  sm: { size: "12px", stroke: "1.5px", dot: "2.5px", orbit: "5.25px" },
} satisfies Record<
  ButtonSize,
  { size: string; stroke: string; dot: string; orbit: string }
>;

export const ButtonSpinnerSlot = styled.span<{ $isLoading?: boolean; $size: ButtonSize }>`
  --spinner-gap: 12px;

  position: relative;
  flex: 0 0 auto;
  width: ${({ $isLoading, $size }) => ($isLoading ? ringBySize[$size].size : "0px")};
  height: ${({ $size }) => ringBySize[$size].size};
  margin-left: ${({ $isLoading }) => ($isLoading ? "var(--spinner-gap)" : "0px")};
  transition:
    width var(--motion-slow, 320ms) var(--ease-emphasized, ease),
    margin-left var(--motion-slow, 320ms) var(--ease-emphasized, ease);

  @media (max-width: 520px) {
    --spinner-gap: 8px;
  }
`;

/* The ring's own spin animation owns its transform, so the entrance (fade,
   slide from the label, scale up) is played by this holder around it. It
   starts a beat after the slot begins to open, so the ring arrives into space
   that is already there. */
export const ButtonSpinnerHolder = styled.span<{ $isLoading?: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${({ $isLoading }) => ($isLoading ? 1 : 0)};
  transform: ${({ $isLoading }) => ($isLoading ? "none" : "translateX(-6px) scale(0.8)")};
  transition:
    opacity var(--motion-base, 220ms) var(--ease-standard, ease)
      ${({ $isLoading }) => ($isLoading ? "80ms" : "0ms")},
    transform var(--motion-slow, 320ms) var(--ease-emphasized, ease)
      ${({ $isLoading }) => ($isLoading ? "80ms" : "0ms")};
  pointer-events: none;
`;

/* The shared ring (components/common/Spinner) at the button's size. */
export const ButtonSpinner = styled(Ring)<{ $size: ButtonSize }>`
  ${({ $size }) => {
    const ring = ringBySize[$size];

    return css`
      --spinner-size: ${ring.size};
      --spinner-stroke: ${ring.stroke};
      --spinner-dot: ${ring.dot};
      --spinner-orbit: ${ring.orbit};
    `;
  }};
`;
