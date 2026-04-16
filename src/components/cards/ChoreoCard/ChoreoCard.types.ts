export type ChoreoCardButtonProps = {
  href?: string;
  text?: string;
};

export type ChoreoCardProps = {
  videoSrc?: string;
  posterSrc?: string;
  title?: string;
  firstButtonOptions?: ChoreoCardButtonProps;
  secondButtonOptions?: ChoreoCardButtonProps;
};
