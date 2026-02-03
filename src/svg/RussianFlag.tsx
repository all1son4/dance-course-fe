import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const RussianFlag: FC<IIconProps> = ({ width = 18, height = 18 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_221_802)">
        <path
          d="M9 18C13.9706 18 18 13.9706 18 9C18 4.02944 13.9706 0 9 0C4.02944 0 0 4.02944 0 9C0 13.9706 4.02944 18 9 18Z"
          fill="#F0F0F0"
        />
        <path
          d="M17.4402 12.1305C17.802 11.1555 18 10.1009 18 9.00005C18 7.89916 17.802 6.84462 17.4402 5.86963H0.559793C0.198035 6.84462 0 7.89916 0 9.00005C0 10.1009 0.198035 11.1555 0.559793 12.1305L9 12.9131L17.4402 12.1305Z"
          fill="#0052B4"
        />
        <path
          d="M9 18C12.8697 18 16.1686 15.5576 17.4402 12.1304H0.559792C1.83143 15.5576 5.13031 18 9 18Z"
          fill="#D80027"
        />
      </g>
      <defs>
        <clipPath id="clip0_221_802">
          <rect width="18" height="18" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};

export default RussianFlag;
