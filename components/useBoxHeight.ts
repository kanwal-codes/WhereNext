import { useCallback, useRef, useState } from "react";

/** The measured height of a floating box (the ask box and the answers above it), kept current as it grows, so the content under it can scroll clear. */
export function useBoxHeight() {
  const [height, setHeight] = useState(0);
  const watch = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    watch.current?.disconnect();
    watch.current = null;
    if (!el) { setHeight(0); return; }
    const measure = () => setHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    watch.current = new ResizeObserver(measure);
    watch.current.observe(el);
  }, []);
  return { height, ref };
}
