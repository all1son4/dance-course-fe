import Button from "@/components/common/Button";
import SvgAsset from "@/components/common/SvgAsset";
import PreviewClip from "@/components/other/PreviewClip";
import VideoPlayer from "@/components/other/VideoPlayer/VideoPlayer";
import { previewClipRootProps } from "@/lib/preview-clip";

import {
  ButtonBox,
  CARD_MEDIA_RADIUS,
  CardContainer,
  CardFooter,
  CardHighlight,
  CardHighlights,
  CardPrice,
  CardPriceFact,
  CardPriceLabel,
  CardPriceLine,
  CardSubtitle,
  CardSurface,
  CardText,
  CardTitle,
  CompareAtPrice,
  IconBox,
  InteractiveBox,
  PosterBox,
  PriceAnchorCurrent,
  PriceAnchorLabel,
  PriceAnchorRow,
} from "./ChoreoCard.styles";
import type { ChoreoCardProps } from "./ChoreoCard.types";

export default function ChoreoCard({
  analyticsId,
  firstButtonOptions,
  highlights,
  icon,
  posterSrc,
  previewSrc,
  price,
  priceAnchor,
  priceLabel,
  secondButtonOptions,
  specialOffer,
  subtitle,
  title,
  videoSrc,
}: ChoreoCardProps) {
  const hasFirstButton = Boolean(firstButtonOptions?.text);
  const hasSecondButton = Boolean(secondButtonOptions?.text);
  const hasHighlights = Boolean(highlights?.length);
  const compareAt = priceAnchor && (
    <CompareAtPrice>
      <PriceAnchorLabel>{priceAnchor.label}</PriceAnchorLabel>
      <s>{priceAnchor.compareAt}</s>
    </CompareAtPrice>
  );

  return (
    <CardContainer {...(previewSrc ? previewClipRootProps : {})}>
      {icon && <IconBox className="choreoCardIconBox">{icon}</IconBox>}
      <CardSurface className="choreoCardSurface" $isSpecialOffer={specialOffer}>
        {videoSrc && (
          <VideoPlayer
            analyticsId={analyticsId}
            src={videoSrc}
            previewSrc={previewSrc}
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
            {previewSrc && <PreviewClip src={previewSrc} />}
          </PosterBox>
        )}
        <InteractiveBox>
          {(title || subtitle || hasHighlights) && (
            <CardText>
              {title && <CardTitle>{title}</CardTitle>}
              {subtitle && <CardSubtitle>{subtitle}</CardSubtitle>}
              {!price && priceAnchor?.current && (
                <PriceAnchorRow>
                  {compareAt}
                  <PriceAnchorCurrent>{priceAnchor.current}</PriceAnchorCurrent>
                </PriceAnchorRow>
              )}
              {hasHighlights && (
                <CardHighlights>
                  {highlights?.map((highlight) => (
                    <CardHighlight key={highlight}>{highlight}</CardHighlight>
                  ))}
                </CardHighlights>
              )}
            </CardText>
          )}
          {(price || hasFirstButton || hasSecondButton) && (
            <CardFooter>
              {price && (
                <CardPriceFact>
                  {priceLabel && <CardPriceLabel>{priceLabel}</CardPriceLabel>}
                  <CardPriceLine>
                    <CardPrice>{price}</CardPrice>
                    {compareAt}
                  </CardPriceLine>
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
