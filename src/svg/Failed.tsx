import Image from "next/image";
import { FC } from "react";

import { IIconProps } from "@/types/icons";

const FAILED_ICON_SRC = "/images/payment-status/failed.png";

export const Failed: FC<IIconProps> = ({ width = 100, height = 103, style }) => {
  return (
    <Image
      alt=""
      aria-hidden="true"
      height={height}
      priority
      src={FAILED_ICON_SRC}
      style={style}
      width={width}
    />
  );
};

export default Failed;
