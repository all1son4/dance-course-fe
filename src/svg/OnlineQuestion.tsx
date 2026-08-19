import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const OnlineQuestion: FC<IIconProps> = ({ width = 50, height = 50 }) => {
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
        stroke="url(#paint0_linear_1816_2953)"
      />
      <path
        d="M22.4961 22.5C22.4961 21.1193 23.6154 20 24.9961 20C26.3768 20 27.4961 21.1193 27.4961 22.5C27.4961 23.3569 27.0649 24.1131 26.4078 24.5636C25.7244 25.0319 24.9961 25.6716 24.9961 26.5M25.1211 29.75H24.9961M34.4961 25C34.4961 30.2467 30.2428 34.5 24.9961 34.5C23.368 34.5 21.8355 34.0904 20.4961 33.3687C18.6279 32.362 17.3707 33.2979 16.262 33.4658C16.0938 33.4913 15.9263 33.4302 15.8061 33.31C15.6235 33.1274 15.5888 32.8451 15.6896 32.6074C16.1248 31.5818 16.5243 29.6382 15.9795 28C15.6659 27.057 15.4961 26.0483 15.4961 25C15.4961 19.7533 19.7494 15.5 24.9961 15.5C30.2428 15.5 34.4961 19.7533 34.4961 25ZM25.2461 29.75C25.2461 29.8881 25.1342 30 24.9961 30C24.858 30 24.7461 29.8881 24.7461 29.75C24.7461 29.6119 24.858 29.5 24.9961 29.5C25.1342 29.5 25.2461 29.6119 25.2461 29.75Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_1816_2953"
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

export default OnlineQuestion;
