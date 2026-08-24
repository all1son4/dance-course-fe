import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const Birthday34Badge: FC<IIconProps> = ({ width = 256, height = 284 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 256 284"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <image
        href="/images/birthday_ring.webp"
        x="26.1"
        y="-0.5"
        width="238.3"
        height="238.3"
      />
      <image
        href="/images/birthday_34.webp"
        x="-19.8"
        y="150.8"
        width="176.9"
        height="176.9"
        style={{ mixBlendMode: "luminosity" }}
      />
    </svg>
  );
};

export default Birthday34Badge;
