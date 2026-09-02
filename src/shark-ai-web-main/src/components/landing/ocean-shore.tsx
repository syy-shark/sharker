import type { ReactNode } from "react";

/**
 * Premium shoreline wrap for bottom-of-page content.
 * Photographic seascape only — no cartoon waves.
 */
export function OceanShore({ children }: { children: ReactNode }) {
  return (
    <div className="ocean-shore">
      <div className="ocean-shore__photo" aria-hidden />
      <div className="ocean-shore__veil" aria-hidden />
      <div className="ocean-shore__content">{children}</div>
    </div>
  );
}
