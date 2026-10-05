"use client";

import React, { useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { hotelPhotoSrc } from "@/lib/hotel-photo";

/** A hotel photograph served through our own origin (lib/hotel-photo.ts); a photo that will not load gives way to `fallback` instead of an empty frame. */
export function HotelPhoto({ src, fallback, ...rest }: { src?: string | null; fallback: ReactNode } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element -- provider image, arbitrary host
  return <img src={hotelPhotoSrc(src)} alt="" loading="lazy" onError={() => setFailed(true)} {...rest} />;
}
