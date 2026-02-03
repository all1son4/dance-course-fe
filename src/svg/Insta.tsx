import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const Insta: FC<IIconProps> = ({ width = 44, height = 44 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.5" y="0.5" width="43" height="43" rx="21.5" fill="#7C0002" />
      <rect
        x="0.5"
        y="0.5"
        width="43"
        height="43"
        rx="21.5"
        stroke="url(#paint0_linear_334_273)"
      />
      <path
        d="M14.0834 21.9999C14.0834 18.268 14.0834 16.402 15.2427 15.2426C16.4021 14.0833 18.2681 14.0833 22 14.0833C25.732 14.0833 27.598 14.0833 28.7574 15.2426C29.9167 16.402 29.9167 18.268 29.9167 21.9999C29.9167 25.7318 29.9167 27.5978 28.7574 28.7573C27.598 29.9166 25.732 29.9166 22 29.9166C18.2681 29.9166 16.4021 29.9166 15.2427 28.7573C14.0834 27.5978 14.0834 25.7318 14.0834 21.9999Z"
        stroke="white"
        strokeLinejoin="round"
      />
      <path
        d="M25.75 22C25.75 24.0711 24.0711 25.75 22 25.75C19.9289 25.75 18.25 24.0711 18.25 22C18.25 19.9289 19.9289 18.25 22 18.25C24.0711 18.25 25.75 19.9289 25.75 22Z"
        stroke="white"
        strokeLinejoin="round"
      />
      <path d="M26.5907 17.4167H26.5823" stroke="white" strokeLinejoin="round" />
      <defs>
        <linearGradient
          id="paint0_linear_334_273"
          x1="22"
          y1="0"
          x2="22"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="0.495192" stopColor="#E4D2D2" />
          <stop offset="1" stopColor="white" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default Insta;
