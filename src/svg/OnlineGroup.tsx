import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const OnlineGroup: FC<IIconProps> = ({ width = 50, height = 50 }) => {
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
        stroke="url(#paint0_linear_187_1918)"
      />
      <path
        d="M35 20.2834C35 22.9249 32.7611 25.0667 30 25.0667C29.6753 25.0671 29.3516 25.0371 29.0327 24.9772C28.8031 24.9341 28.6883 24.9126 28.6082 24.9248C28.5281 24.937 28.4145 24.9974 28.1874 25.1182C27.545 25.4598 26.7959 25.5805 26.0755 25.4465C26.3493 25.1097 26.5363 24.7056 26.6188 24.2724C26.6688 24.0074 26.545 23.75 26.3594 23.5616C25.5166 22.7058 25 21.5525 25 20.2834C25 17.6418 27.2388 15.5 30 15.5C32.7611 15.5 35 17.6418 35 20.2834Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M28.4922 20.5H28.5003M31.4922 20.5H31.5003"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M20.5019 34.4999H17.7182C17.3949 34.4999 17.0702 34.4544 16.7733 34.3268C15.8067 33.9116 15.3162 33.3632 15.0877 33.0201C14.9576 32.8249 14.9762 32.5763 15.1173 32.3889C16.2372 30.9014 18.8385 30.0029 20.5067 30.0029C22.1748 30.0029 24.7714 30.9014 25.8913 32.3889C26.0324 32.5763 26.0509 32.8249 25.9209 33.0201C25.6923 33.3632 25.2019 33.9116 24.2353 34.3268C23.9383 34.4544 23.6137 34.4999 23.2904 34.4999H20.5019Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M23.285 24.7887C23.285 26.32 22.0409 27.5614 20.5063 27.5614C18.9716 27.5614 17.7275 26.32 17.7275 24.7887C17.7275 23.2574 18.9716 22.0161 20.5063 22.0161C22.0409 22.0161 23.285 23.2574 23.285 24.7887Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_187_1918"
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

export default OnlineGroup;
