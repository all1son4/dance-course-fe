import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const CheckboxIcon: FC<IIconProps> = ({ width = 12, height = 9 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 12 9"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.8381 0.298556C10.1804 -0.0719205 10.7656 -0.101773 11.1453 0.232341C11.525 0.566594 11.5553 1.13894 11.2131 1.50985L4.76041 8.50304C4.42178 8.86994 3.84393 8.90317 3.46319 8.57809L0.316417 5.88799C-0.0682566 5.5592 -0.107851 4.98797 0.22873 4.61225C0.56537 4.23658 1.15027 4.19883 1.53499 4.52749L3.99564 6.6296L9.8381 0.298556Z"
        fill="white"
      />
    </svg>
  );
};

export default CheckboxIcon;
