import { useEffect, useState } from "react";

/** True once `ms` have passed since mount: heavy content (a map) waits for the panel's slide to finish instead of competing with it. */
export function useSettled(ms = 450): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return settled;
}
