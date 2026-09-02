export type ToastTone = "success" | "error" | "info";
export type ToastPayload = { id: number; message: string; tone: ToastTone };

const eventName = "trip-toast";
let seq = 0;

/** Fire a transient toast. Rendered by <ToastHost/> mounted once per app shell. */
export function notifyToast(message: string, tone: ToastTone = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(eventName, { detail: { id: ++seq, message, tone } }));
}

export function subscribeToasts(listener: (toast: ToastPayload) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<ToastPayload>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
