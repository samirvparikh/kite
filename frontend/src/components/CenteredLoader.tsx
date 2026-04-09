import React from "react";
import { BrandLogo } from "./BrandLogo";

type Props = {
  label?: string;
};

const CenteredLoader: React.FC<Props> = ({ label = "Loading…" }) => {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <div className="relative flex items-center justify-center">
        <span
          className="absolute h-20 w-20 animate-spin rounded-full border-2 border-slate-200 border-t-brand-orange"
          aria-hidden
        />
        <BrandLogo
          heightClass="h-10"
          className="relative z-10 animate-pulse rounded-md bg-white px-2 py-1 shadow-sm"
        />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
};

export default CenteredLoader;
