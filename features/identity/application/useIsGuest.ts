"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** True while the visitor is on an anonymous (guest) session — i.e. hasn't saved an account yet. */
export function useIsGuest() {
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    let live = true;
    void createSupabaseBrowserClient().auth.getSession().then(({ data }) => {
      if (live) setGuest(data.session?.user.is_anonymous === true);
    });
    return () => {
      live = false;
    };
  }, []);
  return guest;
}
