import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const OnlineCalendar: FC<IIconProps> = ({ width = 50, height = 50 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 50 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.5" y="0.5" width="49" height="49" rx="24.5" fill="#540402" />
      <rect
        x="0.5"
        y="0.5"
        width="49"
        height="49"
        rx="24.5"
        stroke="url(#paint0_linear_187_1942)"
      />
      <path
        d="M29 15V19M21 15V19"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 17H24C20.2288 17 18.3431 17 17.1716 18.1716C16 19.3431 16 21.2288 16 25V27C16 30.7712 16 32.6569 17.1716 33.8284C18.3431 35 20.2288 35 24 35H26C29.7712 35 31.6569 35 32.8284 33.8284C34 32.6569 34 30.7712 34 27V25C34 21.2288 34 19.3431 32.8284 18.1716C31.6569 17 29.7712 17 26 17Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 23H34"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_187_1942"
          x1="25"
          y1="0"
          x2="25"
          y2="50"
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

export default OnlineCalendar;
