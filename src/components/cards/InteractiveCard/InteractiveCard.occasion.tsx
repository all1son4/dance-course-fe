import type { ComponentType } from "react";

import {
  OccasionArtwork,
  OccasionBackgroundArtwork,
  OccasionEdgeArtwork,
} from "./InteractiveCard.occasion.styles";
import type { InteractiveCardOccasionTheme } from "./InteractiveCard.types";

function HalloweenArtwork() {
  return (
    <>
      <OccasionEdgeArtwork
        viewBox="0 0 32 230"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M0 0h28v37c0 6-2 10-2 17v29c0 4-2 6-4 6s-4-2-4-6V58c0-4-3-6-4-3v71c0 5-2 8-5 8s-5-3-5-7V91c0-5-2-7-4-5Z" />
        <path d="M0 96c4 1 8 5 8 12v73c0 5-2 9-5 9s-3-3-3-7Z" opacity="0.7" />
        <path d="M22 99c-1 4-3 6-3 9a3 3 0 0 0 6 0c0-3-2-5-3-9Z" opacity="0.6" />
        <path d="M6 204c-1 3-2 5-2 7a2 2 0 0 0 4 0c0-2-1-4-2-7Z" opacity="0.4" />
        <path
          d="M25 38c0 8-2 11-2 17v26M11 62v62"
          fill="none"
          stroke="#c47568"
          strokeWidth="0.8"
          opacity="0.7"
        />
      </OccasionEdgeArtwork>
      <OccasionArtwork
        viewBox="0 0 180 144"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <g
          transform="scale(1.55 1)"
          stroke="currentColor"
          strokeWidth="0.8"
          opacity="0.4"
        >
          <path d="M116 0H0M116 0 8 36M116 0 31 71M116 0 67 99M116 0V113" />
          <path d="M91 0Q93 6 92 8Q94 13 97 16Q103 18 105 23Q110 25 116 25" />
          <path d="M66 0Q70 11 68 16Q73 25 78 32Q88 36 94 45Q105 49 116 50" />
          <path d="M40 0Q47 16 44 24Q50 39 59 48Q75 55 83 68Q99 74 116 75" />
          <path d="M15 0Q23 21 20 32Q30 52 40 64Q62 74 72 90Q94 99 116 100" />
          <path d="M83 68V117" opacity="0.8" />
        </g>
        <g
          transform="translate(46 0) translate(83 124) scale(1.15) translate(-83 -124)"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        >
          <path d="m79 119-5-5-1-5m6 13-8-2-3-4m11 9-8 2-3 5m12-4-5 6v5m12-20 5-5 1-5m-6 13 8-2 3-4m-11 9 8 2 3 5m-12-4 5 6v5" />
          <ellipse cx="83" cy="124" rx="4.5" ry="6" fill="currentColor" stroke="none" />
          <circle cx="83" cy="117.5" r="2.8" fill="currentColor" stroke="none" />
        </g>
      </OccasionArtwork>
    </>
  );
}

function HalloweenBackgroundArtwork() {
  return (
    <OccasionBackgroundArtwork
      viewBox="0 0 240 300"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor" opacity="0.8">
        <path
          transform="translate(62 10) rotate(-12 20 12)"
          d="m20 9-3-5-2 6C11 7 6 4 1 5c3 3 4 7 4 11 4-3 7 0 8 3 3-2 5 0 7 4 2-4 4-6 7-4 1-3 4-6 8-3 0-4 1-8 4-11-5-1-10 2-14 5l-2-6-3 5Z"
        />
        <path
          transform="translate(154 24) rotate(16 20 12) scale(0.7)"
          d="m20 9-3-5-2 6C11 7 6 4 1 5c3 3 4 7 4 11 4-3 7 0 8 3 3-2 5 0 7 4 2-4 4-6 7-4 1-3 4-6 8-3 0-4 1-8 4-11-5-1-10 2-14 5l-2-6-3 5Z"
        />
      </g>
      <g transform="translate(0 60)">
        <g
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M120 63C94 42 63 50 44 72C20 98 18 140 35 170C49 196 76 207 100 199C112 207 129 207 141 199C168 208 193 195 207 169C223 140 219 100 197 75C180 54 153 43 129 62"
            fill="currentColor"
            fillOpacity="0.09"
          />
          <path d="M112 64C116 51 115 40 110 29C124 27 138 32 143 42C131 43 125 52 126 64" />
          <path
            d="M100 64C75 86 69 160 100 199M139 65C163 92 166 161 141 199"
            opacity="0.65"
          />
          <path d="M120 64C108 101 106 166 120 203" opacity="0.4" />
        </g>
        <g fill="currentColor" opacity="0.7">
          <path d="m65 111 34 10-26 16zm109 0-34 10 26 16z" />
          <path d="m75 155 22 6 8-10 14 12 14-12 8 10 22-6c-19 32-58 40-88 0Z" />
        </g>
      </g>
    </OccasionBackgroundArtwork>
  );
}

type OccasionArtworkSet = {
  header: ComponentType;
  background?: ComponentType;
};

export const occasionArtwork: Record<InteractiveCardOccasionTheme, OccasionArtworkSet> = {
  halloween: {
    header: HalloweenArtwork,
    background: HalloweenBackgroundArtwork,
  },
};
