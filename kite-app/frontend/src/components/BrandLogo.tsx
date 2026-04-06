import React from "react";

type Props = {
  /** Tailwind height class, e.g. h-8, h-10, h-12 */
  heightClass?: string;
  className?: string;
};

/** Full wordmark from `/inningsstar-logo.png` (public). */
export const BrandLogo: React.FC<Props> = ({
  heightClass = "h-9",
  className = "",
}) => (
  <img
    src="/inningsstar-logo.png"
    alt="Inningstar"
    className={`w-auto max-w-full object-contain object-left ${heightClass} ${className}`.trim()}
    decoding="async"
  />
);
