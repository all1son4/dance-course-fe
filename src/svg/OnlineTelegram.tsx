import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const OnlineTelegram: FC<IIconProps> = ({ width = 50, height = 50 }) => {
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
        stroke="url(#paint0_linear_187_1956)"
      />
      <path
        d="M24.9854 28.4083L28.2268 32.0936C29.4277 33.4589 30.0282 34.1416 30.6567 33.9754C31.2852 33.8092 31.5008 32.9108 31.9318 31.1138L34.3229 21.1459C34.9868 18.3783 35.3187 16.9945 34.5808 16.312C33.843 15.6295 32.564 16.1372 30.0061 17.1528L18.1388 21.8645C16.0929 22.6767 15.07 23.0829 15.0051 23.7808C14.9984 23.8522 14.9983 23.9241 15.0047 23.9955C15.0675 24.6937 16.0892 25.1033 18.1326 25.9223C19.0584 26.2934 19.5213 26.479 19.8532 26.8344C19.8905 26.8743 19.9264 26.9157 19.9608 26.9584C20.2666 27.3384 20.3971 27.8371 20.6581 28.8344L21.1465 30.701C21.4005 31.6715 21.5275 32.1568 21.8601 32.223C22.1927 32.2891 22.4823 31.8867 23.0614 31.0819L24.9854 28.4083ZM24.9854 28.4083L24.6676 28.0771C24.3059 27.7001 24.1251 27.5117 24.1251 27.2775C24.1251 27.0433 24.3059 26.8548 24.6676 26.4778L28.2406 22.7541"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_187_1956"
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

export default OnlineTelegram;
