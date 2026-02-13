"use client";

import { Button, VideoPlayer } from "@/components";

import { ButtonBox, CardContainer, CardTitle, InteractiveBox } from "./ChoreoCard.styles";
import { TChoreoCard } from "./ChoreoCard.types";

export default function ChoreoCard(choreo: TChoreoCard) {
  return (
    <CardContainer>
      {choreo?.videoSrc && (
        <VideoPlayer
          src={choreo.videoSrc}
          poster={choreo.postrSrc}
          iconSize="40px"
          buttonSize="80px"
          radius="40px 40px 0 0"
          aspectRatio="1 / 0.67"
        />
      )}
      <InteractiveBox>
        <CardTitle>{choreo.title}</CardTitle>
        <ButtonBox>
          {choreo.firstButtonOptions?.text && (
            <Button buttonText={choreo.firstButtonOptions.text} />
          )}
          {choreo.secondButtonOptions?.text && (
            <Button buttonText={choreo.secondButtonOptions.text} />
          )}
        </ButtonBox>
      </InteractiveBox>
    </CardContainer>
  );
}
