import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const Birthday34Popup: FC<IIconProps> = ({ width = 255, height = 246 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 255 246"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <rect width="230" height="239" fill="url(#pattern0_1820_3500)" />
      <rect
        x="89"
        y="118"
        width="166"
        height="128"
        fill="url(#pattern1_1820_3500)"
        style={{ mixBlendMode: "luminosity" }}
      />
      <defs>
        <pattern
          id="pattern0_1820_3500"
          patternContentUnits="objectBoundingBox"
          width="1"
          height="1"
        >
          <use
            xlinkHref="#image0_1820_3500"
            transform="matrix(0.00101478 0 0 0.000976562 -0.0391304 0)"
          />
        </pattern>
        <pattern
          id="pattern1_1820_3500"
          patternContentUnits="objectBoundingBox"
          width="1"
          height="1"
        >
          <use xlinkHref="#image1_1820_3500" transform="scale(0.000976563 0.00126648)" />
        </pattern>
        <image
          id="image0_1820_3500"
          width="1024"
          height="1024"
          preserveAspectRatio="none"
          xlinkHref="/images/birthday_ring.webp"
        />
        <image
          id="image1_1820_3500"
          width="1024"
          height="1024"
          preserveAspectRatio="none"
          xlinkHref="/images/birthday_34.webp"
        />
      </defs>
    </svg>
  );
};

export default Birthday34Popup;
