import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const Chevron: FC<IIconProps> = ({ width = 10, height = 6 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 10 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.5 0.500037C9.5 0.500037 6.18582 5 5 5C3.8141 5 0.5 0.5 0.5 0.5"
        stroke="black"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default Chevron;
