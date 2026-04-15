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
import type { TChoreoCard } from "./ChoreoCard.types";

export default function ChoreoCard(choreo: TChoreoCard) {
  return (
    <CardContainer>
      {choreo?.videoSrc && (
        <VideoPlayer
          src={choreo.videoSrc}
          poster={choreo.posterSrc}
          iconSize="40px"
          buttonSize="80px"
          radius="40px 40px 0 0"
          aspectRatio="1 / 0.67"
        />
      )}
      {!choreo?.videoSrc && choreo?.posterSrc && (
        <PosterBox>
          <SvgAsset
            src={choreo.posterSrc}
            width={1290}
            height={966}
            sizes="(max-width: 767px) 100vw, (max-width: 1300px) 50vw, 485px"
            unoptimized
          />
        </PosterBox>
      )}
      <InteractiveBox>
        <CardTitle>{choreo.title}</CardTitle>
        <ButtonBox>
          {choreo.firstButtonOptions?.text && (
            <Button
              buttonText={choreo.firstButtonOptions.text}
              href={choreo.firstButtonOptions.href}
            />
          )}
          {choreo.secondButtonOptions?.text && (
            <Button
              buttonText={choreo.secondButtonOptions.text}
              href={choreo.secondButtonOptions.href}
            />
          )}
        </ButtonBox>
      </InteractiveBox>
    </CardContainer>
  );
}
