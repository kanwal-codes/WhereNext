"use client";

import { useCallback, useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = { render(el: HTMLElement, options: Record<string, unknown>): string; reset(id?: string): void };
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare Turnstile for the guest sign-in (Supabase verifies the token). A no-op unless
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so the flow works before CAPTCHA is switched on — but
 * with anonymous sign-ins open to the public it should be on in production.
 */
export function useTurnstile() {
  const container = useRef<HTMLDivElement>(null);
  const token = useRef<string | undefined>(undefined);
  const widget = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!SITE_KEY) return;
    const mount = () => {
      if (!window.turnstile || !container.current || widget.current) return;
      widget.current = window.turnstile.render(container.current, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        callback: (value: string) => {
          token.current = value;
        },
        "expired-callback": () => {
          token.current = undefined;
        },
      });
    };
    if (window.turnstile) {
      mount();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (!script) {
      script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "1";
      document.head.appendChild(script);
    }
    script.addEventListener("load", mount);
    return () => script.removeEventListener("load", mount);
  }, []);

  /** Waits (up to ~10s) for a fresh, single-use token; undefined when Turnstile isn't configured. */
  const getToken = useCallback(async () => {
    if (!SITE_KEY) return undefined;
    for (let i = 0; i < 100 && !token.current; i++) await new Promise((resolve) => setTimeout(resolve, 100));
    const value = token.current;
    token.current = undefined;
    if (widget.current) window.turnstile?.reset(widget.current);
    return value;
  }, []);

  return { container, getToken };
}
