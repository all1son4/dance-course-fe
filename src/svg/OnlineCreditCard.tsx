import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const OnlineCreditCard: FC<IIconProps> = ({ width = 50, height = 50 }) => {
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
        stroke="url(#paint0_linear_1443_2435)"
      />
      <path
        d="M15 25C15 21.4625 15 19.6938 16.0528 18.5129C16.2212 18.324 16.4068 18.1494 16.6075 17.9909C17.8621 17 19.7414 17 23.5 17H26.5C30.2586 17 32.1379 17 33.3925 17.9909C33.5932 18.1494 33.7788 18.324 33.9472 18.5129C35 19.6938 35 21.4625 35 25C35 28.5375 35 30.3062 33.9472 31.4871C33.7788 31.676 33.5932 31.8506 33.3925 32.0091C32.1379 33 30.2586 33 26.5 33H23.5C19.7414 33 17.8621 33 16.6075 32.0091C16.4068 31.8506 16.2212 31.676 16.0528 31.4871C15 30.3062 15 28.5375 15 25Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 29H24.5"
        stroke="white"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27.5 29H31"
        stroke="white"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 22H35"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_1443_2435"
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

export default OnlineCreditCard;
