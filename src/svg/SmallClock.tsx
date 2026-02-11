import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const SmallClock: FC<IIconProps> = ({ width = 18, height = 18 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 16.5C13.1421 16.5 16.5 13.1421 16.5 9C16.5 4.85786 13.1421 1.5 9 1.5C4.85786 1.5 1.5 4.85786 1.5 9C1.5 13.1421 4.85786 16.5 9 16.5Z"
        stroke="black"
        strokeWidth="1.2"
      />
      <path d="M9 6V9L10.5 10.5" stroke="black" strokeWidth="1.2" />
    </svg>
  );
};

export default SmallClock;
