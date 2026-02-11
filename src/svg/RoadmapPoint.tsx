import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const RoadmapPoint: FC<IIconProps> = ({ width = 40, height = 40 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="19.5" stroke="#B9B9B9" />
      <circle cx="20.0005" cy="20" r="8.42627" fill="#B9B9B9" />
    </svg>
  );
};

export default RoadmapPoint;
