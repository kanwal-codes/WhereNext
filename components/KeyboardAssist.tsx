"use client";

import { useFocusIntoView } from "@/lib/use-keyboard-fit";

/** Mounted once in the root layout: keeps a focused text field out from under the phone keyboard on every screen. */
export function KeyboardAssist() {
  useFocusIntoView();
  return null;
}
