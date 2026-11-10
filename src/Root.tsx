import React from "react";
import { Composition } from "remotion";
import { ManjhiShort } from "./videos/manjhi/Manjhi";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ManjhiShort"
        component={ManjhiShort}
        durationInFrames={1254}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
