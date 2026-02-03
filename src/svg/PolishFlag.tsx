import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const PolishFlag: FC<IIconProps> = ({ width = 18, height = 18 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_219_2968)">
        <path
          d="M9 18C13.9706 18 18 13.9706 18 9C18 4.02944 13.9706 0 9 0C4.02944 0 0 4.02944 0 9C0 13.9706 4.02944 18 9 18Z"
          fill="#F0F0F0"
        />
        <path
          d="M18 9C18 13.9705 13.9705 18 9 18C4.02947 18 0 13.9705 0 9"
          fill="#D80027"
        />
      </g>
      <defs>
        <clipPath id="clip0_219_2968">
          <rect width="18" height="18" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};

export default PolishFlag;
