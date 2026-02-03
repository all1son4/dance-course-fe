import { FC } from "react";

import { IIconProps } from "@/types/icons";

export const Telegram: FC<IIconProps> = ({ width = 44, height = 44 }) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.5" y="0.5" width="43" height="43" rx="21.5" fill="#7C0002" />
      <rect
        x="0.5"
        y="0.5"
        width="43"
        height="43"
        rx="21.5"
        stroke="url(#paint0_linear_408_400)"
      />
      <path
        d="M21.9877 24.8402L24.6888 27.9113C25.6896 29.0491 26.19 29.618 26.7138 29.4795C27.2375 29.341 27.4172 28.5923 27.7763 27.0948L29.7689 18.7882C30.3222 16.4819 30.5988 15.3288 29.9838 14.76C29.369 14.1912 28.3032 14.6144 26.1716 15.4607L16.2821 19.3871C14.5773 20.0639 13.7248 20.4024 13.6707 20.984C13.6652 21.0435 13.6651 21.1034 13.6705 21.1629C13.7228 21.7447 14.5742 22.0861 16.277 22.7686C17.0485 23.0778 17.4343 23.2325 17.7108 23.5287C17.7419 23.5619 17.7718 23.5964 17.8005 23.632C18.0553 23.9487 18.1641 24.3642 18.3816 25.1953L18.7886 26.7508C19.0003 27.5596 19.1061 27.964 19.3832 28.0192C19.6604 28.0742 19.9017 27.7389 20.3843 27.0682L21.9877 24.8402ZM21.9877 24.8402L21.7228 24.5642C21.4214 24.2501 21.2708 24.0931 21.2708 23.8979C21.2708 23.7027 21.4214 23.5457 21.7228 23.2315L24.7003 20.1284"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_408_400"
          x1="22"
          y1="0"
          x2="22"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="0.495192" stopColor="#E4D2D2" />
          <stop offset="1" stopColor="white" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default Telegram;
