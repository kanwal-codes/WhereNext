import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The boarding pass as an object: the ink body and the coral stub, drawn the same way on the first
 * screen (where it is the prompt) and on the last (where it is stamped). Callers supply the wrapper
 * (`<form className="bp">` or `<div className="bp">`) and the three live parts: the TO field, the
 * field values and the button on the stub. See "Boarding Pass Hero" for why each piece is here.
 */

export const FIELD_LABELS = ["Passengers", "Dates", "Budget", "Style"] as const;
export const FIELD_EMPTY = [
  "Add who’s going",
  "Add dates",
  "Add a budget",
  "Add a vibe",
] as const;

/** The big code. Each letter turns over in turn as the pass is printed. */
export function Code({ value }: { value: string }) {
  return (
    <div className="bp-code" role="img" aria-label={`From ${value}`}>
      {[...value].map((ch, i) => (
        <span
          key={`${value}-${i}`}
          aria-hidden="true"
          style={{ "--i": i } as React.CSSProperties}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

export function Field({
  label,
  value,
  empty,
}: {
  label: string;
  value?: string;
  empty: string;
}) {
  return (
    <div className="bp-field">
      <dt className="bp-lab">{label}</dt>
      <dd className={cn("bp-val", !value && "bp-val-empty")}>
        {/* Re-keyed by its text, so a new value rises in and gets its coral tick. */}
        <span key={value ?? "empty"} className={value ? "bp-fresh" : undefined}>
          {value ?? empty}
        </span>
      </dd>
    </div>
  );
}

const Arrow = () => (
  <svg
    className="bp-arrow-svg"
    width="40"
    height="20"
    viewBox="0 0 40 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 10h34M28 3l8 7-8 7" />
  </svg>
);

export function PassBody({
  code,
  to,
  fields,
  stub,
  stamp,
  onPointerMove,
  shineRef,
}: {
  code: string;
  to: ReactNode;
  fields: ReactNode;
  stub: ReactNode;
  stamp?: ReactNode;
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>;
  shineRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <>
      <div className="bp-main" onPointerMove={onPointerMove}>
        <div ref={shineRef} className="bp-shine" aria-hidden="true" />
        <div
          className="bp-top bp-in"
          style={{ "--d": "900ms" } as React.CSSProperties}
          aria-hidden="true"
        >
          <span className="bp-air">Where Next</span>
          <span>Boarding pass</span>
          <span>Trip 001</span>
        </div>
        <div className="bp-route">
          <div className="bp-from">
            <span
              className="bp-lab bp-in"
              style={{ "--d": "940ms" } as React.CSSProperties}
            >
              From
            </span>
            <Code value={code} />
          </div>
          <div
            className="bp-arrow bp-in"
            style={{ "--d": "1000ms" } as React.CSSProperties}
          >
            <Arrow />
          </div>
          <div
            className="bp-dest bp-in"
            style={{ "--d": "1040ms" } as React.CSSProperties}
          >
            <span className="bp-lab">
              <span className="bp-lab-d">To</span>
              <span className="bp-lab-m">Where next?</span>
            </span>
            {to}
          </div>
        </div>
        <dl
          className="bp-fields bp-in"
          style={{ "--d": "1100ms" } as React.CSSProperties}
        >
          {fields}
        </dl>
        <div className="bp-foot" aria-hidden="true">
          <span className="bp-bar" />
          <span className="bp-cap">WN 001 · Roam</span>
        </div>
        {stamp}
      </div>
      <div className="bp-stub">
        <span className="bp-perf" aria-hidden="true" />
        <div
          className="bp-in"
          style={{ "--d": "1150ms" } as React.CSSProperties}
        >
          <span className="bp-lab">Gate</span>
          <div className="bp-gate">Roam</div>
        </div>
        <dl
          className="bp-stubfields bp-in"
          style={{ "--d": "1220ms" } as React.CSSProperties}
        >
          <div>
            <dt className="bp-lab">Fare</dt>
            <dd className="bp-sv">Free to try</dd>
          </div>
          <div>
            <dt className="bp-lab">Account</dt>
            <dd className="bp-sv">Not needed</dd>
          </div>
        </dl>
        {stub}
      </div>
    </>
  );
}
