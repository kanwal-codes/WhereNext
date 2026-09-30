"use client";

import React, { useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { BlurImage } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

/**
 * An image that never shows the browser's own broken-image state: it fades in when it loads, and if it
 * fails (or has no source) a quiet stand-in takes its place instead of alt text painted over an empty box.
 */
export function SafeImage({ src, alt, className, fallback, ...rest }: { src?: string | null; alt: string; className?: string; fallback?: ReactNode } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback ?? <div aria-hidden className={cn("bg-muted", className)} />}</>;
  return <BlurImage src={src} alt={alt} className={className} onError={() => setFailed(true)} {...rest} />;
}
