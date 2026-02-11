import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const Play: FC<IIconProps> = ({ width = 40, height = 40 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M31.484 21.41C30.8948 23.6483 28.1108 25.23 22.5425 28.3935C17.1597 31.4515 14.4683 32.9807 12.2994 32.366C11.4027 32.1118 10.5857 31.6293 9.92674 30.9645C8.33301 29.3565 8.33301 26.2377 8.33301 20C8.33301 13.7623 8.33301 10.6435 9.92674 9.03553C10.5857 8.37075 11.4027 7.88813 12.2994 7.63403C14.4683 7.01942 17.1597 8.54845 22.5425 11.6066C28.1108 14.77 30.8948 16.3517 31.484 18.59C31.7272 19.514 31.7272 20.486 31.484 21.41Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default Play;
