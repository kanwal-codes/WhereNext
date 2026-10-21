"use client";

import React, { useState } from "react";
import { googlePhotoSrc } from "@/lib/hotel-photo";
import { cn } from "@/lib/utils";

/** Image that resolves out of a soft blur instead of popping in. */
export function BlurImage({
  src,
  alt,
  className,
  ...rest
}: { src: string; alt: string; className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  // A cached image is already `complete` by the time this ref callback runs, so the
  // `load` event below never fires again — without this check the image stays stuck
  // at opacity-0 on every repeat visit (only a first, uncached load ever showed it).
  const checkLoaded = (img: HTMLImageElement | null) => {
    if (img?.complete) setLoaded(true);
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative, arbitrary sources
    <img
      ref={checkLoaded}
      src={googlePhotoSrc(src)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={cn(
        // Opacity + a hair of scale only. This used to blur-xl -> blur-0: animating a blur is repaint-heavy, and a
        // resting `filter: blur(0)` keeps every photo on its own filtered layer — dozens of them in a long chat.
        "transition-[opacity,transform] duration-500 ease-out",
        loaded ? "scale-100 opacity-100" : "scale-[1.02] opacity-0",
        className,
      )}
      {...rest}
    />
  );
}
