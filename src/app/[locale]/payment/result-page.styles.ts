import styled, { css, keyframes } from "styled-components";

import Spinner from "@/components/common/Spinner";
import { glass } from "@/styles/mixins/glass";

/*
 * The payment result cards (success and failed) share one grammar at every
 * width: icon -> title -> copy -> small notes -> one status card (progress or
 * notice) -> a stack of equally wide actions. Phones get the same order with
 * tighter metrics, so even a 375x667 screen holds every state without a
 * scroll.
 */

/* Entrance of a settled result: the icon pops, then title, copy and actions
   rise one after another. Runs on mount, i.e. the moment verification settles
   on the success page and on first paint of the failed page. */
const resultPop = keyframes`
  from {
    opacity: 0;
    transform: scale(0.6);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const resultRise = keyframes`
  from {
    opacity: 0;
    transform: translate3d(0, 14px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
`;

/* A touch of overshoot (≈3%) so the icon lands like a stamp, not a fade. */
const POP_EASE = "cubic-bezier(0.34, 1.4, 0.64, 1)";
const RISE = "480ms var(--ease-standard, ease)";

const PHONE = "(max-width: 520px)";
const SMALL_PHONE = "(max-width: 360px)";

export const ResultContainer = styled.div`
  display: flex;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 24px 20px;

  @media ${PHONE} {
    padding: 12px;
  }
`;

export const ResultCard = styled.div`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 640px;
  padding: 48px;

  ${glass({
    frost: "static",
    radius: "var(--radius-panel)",
    hoverEffect: false,
  })}

  > img {
    flex: 0 0 auto;
    width: 84px;
    height: 84px;
    animation: ${resultPop} 520ms ${POP_EASE} var(--motion-settle, 40ms) both;
  }

  @media ${PHONE} {
    --glass-radius: 28px;
    padding: 22px 18px 18px;

    > img {
      width: 60px;
      height: 60px;
    }
  }

  @media ${SMALL_PHONE} {
    padding: 18px 16px 16px;

    > img {
      width: 52px;
      height: 52px;
    }
  }
`;

/* Header and footer are hidden on result pages, so this is the page's heading. */
export const ResultTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-fact);
  line-height: 1.15;
  letter-spacing: 0;
  margin: 24px 0 12px;
  color: var(--ink);
  animation: ${resultRise} ${RISE} calc(var(--motion-settle, 40ms) + 120ms) both;

  @media ${PHONE} {
    font-size: 22px;
    margin: 16px 0 8px;
  }

  @media ${SMALL_PHONE} {
    font-size: 20px;
  }
`;

export const ResultParagraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: ${resultRise} ${RISE} calc(var(--motion-settle, 40ms) + 200ms) both;
`;

export const ResultParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);

  @media ${PHONE} {
    font-size: var(--text-small);
    line-height: 1.4;
  }
`;

/** Small print under the copy: how long the invite lasts, until when an access runs. */
export const ResultMeta = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 0;
  margin: 2px 0 0;
  color: rgba(0, 0, 0, 0.66);

  & + & {
    margin-top: 0;
  }

  @media ${PHONE} {
    font-size: var(--text-caption);
    line-height: 1.35;
  }
`;

/**
 * The one status element of the result pages: "checking", "preparing your
 * link", "still processing", "not ready - contact support". `progress`
 * carries the spinner and a warm tint; `notice` a small "!" mark on neutral.
 */
export type StatusKind = "progress" | "notice";

export const StatusCard = styled.div<{ $kind: StatusKind }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border-radius: 18px;
  min-height: 56px;

  ${({ $kind }) =>
    $kind === "progress"
      ? css`
          background: rgba(124, 0, 2, 0.06);
          border: 1px solid rgba(124, 0, 2, 0.16);
        `
      : css`
          background: rgba(0, 0, 0, 0.035);
          border: 1px solid rgba(0, 0, 0, 0.12);
        `}

  @media ${PHONE} {
    gap: 10px;
    padding: 10px 14px;
    border-radius: 16px;
    min-height: 48px;
  }
`;

export const StatusSpinner = styled(Spinner)`
  color: var(--brand);
`;

/** The "!" mark of a notice, drawn to the spinner's 20px so both kinds line up. */
export const StatusMark = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-pill);
  border: 1.5px solid rgba(124, 0, 2, 0.55);
  color: var(--brand);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;

  &::before {
    content: "!";
  }
`;

export const StatusText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-small);
  line-height: 1.4;
  letter-spacing: 0;
  margin: 0;
  color: rgba(16, 16, 16, 0.9);

  @media ${PHONE} {
    font-size: 14px;
    line-height: 1.35;
  }
`;

/**
 * Every action of a result card lives here: a stack of equally wide buttons,
 * the strongest first (red), a second Telegram link in white, the way back
 * home last in glass. Status cards sit in the same column, above the buttons.
 */
export const ResultActions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  margin: 24px 0 0;
  animation: ${resultRise} ${RISE} calc(var(--motion-settle, 40ms) + 280ms) both;

  @media ${PHONE} {
    gap: 8px;
    margin-top: 16px;

    & button,
    & a {
      min-height: 48px;
      padding: 10px 20px;
      font-size: var(--text-body-sm);
    }
  }

  @media ${SMALL_PHONE} {
    & button,
    & a {
      min-height: 44px;
    }
  }
`;
