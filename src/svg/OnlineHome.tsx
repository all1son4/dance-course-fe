import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const OnlineHome: FC<IIconProps> = ({ width = 50, height = 50 }) => {
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
        stroke="url(#paint0_linear_187_1926)"
      />
      <path
        d="M16 24.9896V27.5C16 30.7998 16 32.4497 17.0251 33.4749C18.0502 34.5 19.7002 34.5 23 34.5H27C30.2998 34.5 31.9497 34.5 32.9749 33.4749C34 32.4497 34 30.7998 34 27.5V24.9896C34 23.3083 34 22.4677 33.6441 21.7401C33.2882 21.0124 32.6247 20.4963 31.2976 19.4641L29.2976 17.9085C27.2331 16.3028 26.2009 15.5 25 15.5C23.7991 15.5 22.7669 16.3028 20.7024 17.9085L18.7024 19.4641C17.3753 20.4963 16.7118 21.0124 16.3559 21.7401C16 22.4677 16 23.3083 16 24.9896Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M28 34.5V29.5C28 28.0858 28 27.3787 27.5607 26.9393C27.1213 26.5 26.4142 26.5 25 26.5C23.5858 26.5 22.8787 26.5 22.4393 26.9393C22 27.3787 22 28.0858 22 29.5V34.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_187_1926"
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

export default OnlineHome;
