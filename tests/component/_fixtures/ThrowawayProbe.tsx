import type { ReactNode } from "react";

/**
 * TEST-ONLY disposable probe. Proves the jsdom component lane can render,
 * interact with, and accessibility-check a component built on a SEMANTIC
 * token utility class. It is never imported by application code and never
 * placed in `components/ui/`.
 */
export function ThrowawayProbe({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="bg-action-primary text-on-action"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
