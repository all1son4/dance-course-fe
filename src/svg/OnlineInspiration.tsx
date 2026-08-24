import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const OnlineInspiration: FC<IIconProps> = ({ width = 50, height = 50 }) => {
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
        stroke="url(#paint0_linear_1816_2969)"
      />
      <path
        d="M32 22.6207C32 25.1999 30.7302 27.1852 28.7983 28.4917C28.3483 28.796 28.1233 28.9482 28.0122 29.1212C27.9012 29.2942 27.8633 29.5214 27.7876 29.9757L27.7287 30.3288C27.5957 31.127 27.5292 31.526 27.2494 31.763C26.9697 32 26.5651 32 25.7559 32H23.1444C22.3353 32 21.9307 32 21.651 31.763C21.3712 31.526 21.3047 31.127 21.1717 30.3288L21.1128 29.9757C21.0373 29.5229 20.9996 29.2965 20.8897 29.1243C20.7798 28.9521 20.5543 28.798 20.1033 28.4897C18.1919 27.1832 17 25.1986 17 22.6207C17 18.4119 20.3579 15 24.5 15C25.0137 15 25.5153 15.0525 26 15.1524"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29.5 15L29.7579 15.697C30.0961 16.611 30.2652 17.068 30.5986 17.4014C30.932 17.7348 31.389 17.9039 32.303 18.2421L33 18.5L32.303 18.7579C31.389 19.0961 30.932 19.2652 30.5986 19.5986C30.2652 19.932 30.0961 20.389 29.7579 21.303L29.5 22L29.2421 21.303C28.9039 20.389 28.7348 19.932 28.4014 19.5986C28.068 19.2652 27.611 19.0961 26.697 18.7579L26 18.5L26.697 18.2421C27.611 17.9039 28.068 17.7348 28.4014 17.4014C28.7348 17.068 28.9039 16.611 29.2421 15.697L29.5 15Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M26.5 32V33C26.5 33.9428 26.5 34.4142 26.2071 34.7071C25.9142 35 25.4428 35 24.5 35C23.5572 35 23.0858 35 22.7929 34.7071C22.5 34.4142 22.5 33.9428 22.5 33V32"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_1816_2969"
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

export default OnlineInspiration;
