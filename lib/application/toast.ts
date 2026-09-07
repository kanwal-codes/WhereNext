export type ToastTone = "success" | "error" | "info";
export type ToastAction = { label: string; onClick: () => void };
export type ToastPayload = {
  id: number;
  message: string;
  tone: ToastTone;
  /** Optional inline button (e.g. "Retry"). When present the toast stays until acted on or dismissed. */
  action?: ToastAction;
};

const eventName = "trip-toast";
let seq = 0;

/**
 * Fire a transient toast. Rendered by <ToastHost/> mounted once per app shell.
 * This is the ONLY way to surface an error to the user — never render an inline error line.
 */
export function notifyToast(message: string, tone: ToastTone = "info", action?: ToastAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(eventName, { detail: { id: ++seq, message, tone, action } }));
}

export function subscribeToasts(listener: (toast: ToastPayload) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<ToastPayload>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
