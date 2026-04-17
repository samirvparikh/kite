import React from "react";
import ScannerStaticPage from "../../components/static/ScannerStaticPage";

const StaticCePeBias: React.FC = () => {
  return (
    <ScannerStaticPage
      title="CE / PE bias"
      description="Call/Put side strength interpretation page with static details and a clear visual cue, while preserving your existing Home page look."
      imagePath="/scanners/ce-pe-bias.svg"
    />
  );
};

export default StaticCePeBias;
