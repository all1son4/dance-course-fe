import Image from "next/image";
import { FC } from "react";

import { IIconProps } from "@/types/icons";

const SUCCESS_ICON_SRC = "/images/payment-status/success.png";

export const Success: FC<IIconProps> = ({ width = 100, height = 100, style }) => {
  return (
    <Image
      alt=""
      aria-hidden="true"
      height={height}
      priority
      src={SUCCESS_ICON_SRC}
      style={style}
      width={width}
    />
  );
};

export default Success;
