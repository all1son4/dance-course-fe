import Button from "@/components/common/Button";
import SvgAsset from "@/components/common/SvgAsset";
import VideoPlayer from "@/components/other/VideoPlayer/VideoPlayer";

import {
  ButtonBox,
  CardContainer,
  CardSubtitle,
  CardSurface,
  CardText,
  CardTitle,
  IconBox,
  InteractiveBox,
  PosterBox,
} from "./ChoreoCard.styles";
import type { ChoreoCardProps } from "./ChoreoCard.types";

export default function ChoreoCard({
  firstButtonOptions,
  icon,
  posterSrc,
  secondButtonOptions,
  specialOffer,
  subtitle,
  title,
  videoSrc,
}: ChoreoCardProps) {
  return (
    <CardContainer>
      {icon && <IconBox className="choreoCardIconBox">{icon}</IconBox>}
      <CardSurface $isSpecialOffer={specialOffer}>
        {videoSrc && (
          <VideoPlayer
            src={videoSrc}
            poster={posterSrc}
            iconSize="40px"
            buttonSize="80px"
            radius="0"
            aspectRatio="1 / 0.67"
          />
        )}
        {!videoSrc && posterSrc && (
          <PosterBox>
            <SvgAsset
              src={posterSrc}
              width={1290}
              height={966}
              sizes="(max-width: 767px) 100vw, (max-width: 1200px) 50vw, 390px"
              unoptimized
            />
          </PosterBox>
        )}
        <InteractiveBox>
          {(title || subtitle) && (
            <CardText>
              {title && <CardTitle>{title}</CardTitle>}
              {subtitle && <CardSubtitle>{subtitle}</CardSubtitle>}
            </CardText>
          )}
          <ButtonBox>
            {firstButtonOptions?.text && (
              <Button
                buttonText={firstButtonOptions.text}
                href={firstButtonOptions.href}
                rel="nofollow"
              />
            )}
            {secondButtonOptions?.text && (
              <Button
                buttonText={secondButtonOptions.text}
                href={secondButtonOptions.href}
                rel="nofollow"
              />
            )}
          </ButtonBox>
        </InteractiveBox>
      </CardSurface>
    </CardContainer>
  );
}
