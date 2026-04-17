import React from "react";
import ScannerStaticPage from "../../components/static/ScannerStaticPage";

const Static5MinBreakout: React.FC = () => {
  return (
    <ScannerStaticPage
      title="5 Min Breakout"
      description="First five-minute candle range breakout strategy overview. This page is static and keeps the same Home theme for consistent user experience."
      imagePath="/scanners/5min-breakout.svg"
    />
  );
};

export default Static5MinBreakout;
