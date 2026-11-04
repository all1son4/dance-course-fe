import Button from "@/components/common/Button";
import SvgAsset from "@/components/common/SvgAsset";
import VideoPlayer from "@/components/other/VideoPlayer/VideoPlayer";

import {
  ButtonBox,
  CARD_MEDIA_RADIUS,
  CardContainer,
  CardFooter,
  CardPrice,
  CardPriceFact,
  CardPriceLabel,
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
  analyticsId,
  firstButtonOptions,
  icon,
  posterSrc,
  price,
  priceLabel,
  secondButtonOptions,
  specialOffer,
  subtitle,
  title,
  videoSrc,
}: ChoreoCardProps) {
  const hasFirstButton = Boolean(firstButtonOptions?.text);
  const hasSecondButton = Boolean(secondButtonOptions?.text);

  return (
    <CardContainer>
      {icon && <IconBox className="choreoCardIconBox">{icon}</IconBox>}
      <CardSurface className="choreoCardSurface" $isSpecialOffer={specialOffer}>
        {videoSrc && (
          <VideoPlayer
            analyticsId={analyticsId}
            src={videoSrc}
            poster={posterSrc}
            iconSize="40px"
            buttonSize="80px"
            radius={CARD_MEDIA_RADIUS}
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
          {(price || hasFirstButton || hasSecondButton) && (
            <CardFooter>
              {price && (
                <CardPriceFact>
                  {priceLabel && <CardPriceLabel>{priceLabel}</CardPriceLabel>}
                  <CardPrice>{price}</CardPrice>
                </CardPriceFact>
              )}
              <ButtonBox>
                {firstButtonOptions?.text && (
                  <Button
                    buttonText={firstButtonOptions.text}
                    href={firstButtonOptions.href}
                    prefetch={false}
                    rel="nofollow"
                    analytics={firstButtonOptions.analytics}
                  />
                )}
                {secondButtonOptions?.text && (
                  <Button
                    variant={hasFirstButton ? "secondary" : "primary"}
                    buttonText={secondButtonOptions.text}
                    href={secondButtonOptions.href}
                    prefetch={false}
                    rel="nofollow"
                    analytics={secondButtonOptions.analytics}
                  />
                )}
              </ButtonBox>
            </CardFooter>
          )}
        </InteractiveBox>
      </CardSurface>
    </CardContainer>
  );
}
