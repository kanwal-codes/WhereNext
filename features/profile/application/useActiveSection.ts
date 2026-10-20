import { useEffect, useRef, useState } from "react";
import { SECTIONS } from "../ui/account-options";

/**
 * Which section of the page you are in, for the rail. The rail follows the page: the section whose top has passed about a third of the way
 * down the window is the one you are in. A click on the rail sets the section itself and holds it for a moment (`holdRail`), so the pill does
 * not flicker through the ones scrolled past.
 */
export function useActiveSection() {
  const [active, setActive] = useState<string>("profile");
  const railLock = useRef(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < railLock.current) return;
      const sections = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
      if (!sections.length) return;
      const line = window.innerHeight * 0.35;
      let current = sections[0].id;
      for (const el of sections) if (el.getBoundingClientRect().top <= line) current = el.id;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1].id;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return { active, setActive, holdRail: () => { railLock.current = Date.now() + 900; } };
}
