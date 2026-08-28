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

export const ButtonContent = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1em;
`;

export const ButtonLabel = styled.span``;

/* The shared ring (components/common/Spinner), scaled to the button's text. */
export const ButtonSpinner = styled(Ring)<{ $isLoading?: boolean }>`
  --spinner-size: 14px;
  --spinner-stroke: 1.6px;
  --spinner-dot: 2.6px;
  --spinner-orbit: 8px;

  position: absolute;
  left: 0;
  top: calc(50% - 7px);
  opacity: ${({ $isLoading }) => ($isLoading ? 1 : 0)};
  transform: translate(${({ $isLoading }) => ($isLoading ? "0px" : "-12px")}, -50%)
    scale(${({ $isLoading }) => ($isLoading ? 1 : 0.86)});
  transition:
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease),
    transform var(--motion-base, 220ms) var(--ease-emphasized, ease);
  pointer-events: none;
`;

export const ButtonSpinnerSlot = styled.span<{ $isLoading?: boolean }>`
  position: relative;
  width: ${({ $isLoading }) => ($isLoading ? "14px" : "0px")};
  height: 14px;
  margin-left: ${({ $isLoading }) => ($isLoading ? "12px" : "0px")};
  transition:
    width var(--motion-fast, 160ms) var(--ease-standard, ease),
    margin-left var(--motion-fast, 160ms) var(--ease-standard, ease);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  flex: 0 0 auto;
`;
