import React from "react";
import ScannerStaticPage from "../../components/static/ScannerStaticPage";

const StaticMyTodayChoice: React.FC = () => {
  return (
    <ScannerStaticPage
      title="My Today Choice"
      description="Daily shortlist concept page with static content and matching Home-style layout. Users can quickly identify this menu using the preview image."
      imagePath="/scanners/my-today-choice.svg"
    />
  );
};

export default StaticMyTodayChoice;
