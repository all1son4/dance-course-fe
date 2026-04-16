import Button from "@/components/common/Button";
import SvgAsset from "@/components/common/SvgAsset";
import VideoPlayer from "@/components/other/VideoPlayer/VideoPlayer";

import {
  ButtonBox,
  CardContainer,
  CardTitle,
  InteractiveBox,
  PosterBox,
} from "./ChoreoCard.styles";
import type { ChoreoCardProps } from "./ChoreoCard.types";

export default function ChoreoCard({
  firstButtonOptions,
  posterSrc,
  secondButtonOptions,
  title,
  videoSrc,
}: ChoreoCardProps) {
  return (
    <CardContainer>
      {videoSrc && (
        <VideoPlayer
          src={videoSrc}
          poster={posterSrc}
          iconSize="40px"
          buttonSize="80px"
          radius="40px 40px 0 0"
          aspectRatio="1 / 0.67"
        />
      )}
      {!videoSrc && posterSrc && (
        <PosterBox>
          <SvgAsset
            src={posterSrc}
            width={1290}
            height={966}
            sizes="(max-width: 767px) 100vw, (max-width: 1300px) 50vw, 485px"
            unoptimized
          />
        </PosterBox>
      )}
      <InteractiveBox>
        <CardTitle>{title}</CardTitle>
        <ButtonBox>
          {firstButtonOptions?.text && (
            <Button buttonText={firstButtonOptions.text} href={firstButtonOptions.href} />
          )}
          {secondButtonOptions?.text && (
            <Button
              buttonText={secondButtonOptions.text}
              href={secondButtonOptions.href}
            />
          )}
        </ButtonBox>
      </InteractiveBox>
    </CardContainer>
  );
}
