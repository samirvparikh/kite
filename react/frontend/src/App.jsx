import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import CallbackPage from "./pages/CallbackPage";
import DashboardPage from "./pages/DashboardPage";
import ScannerPage from "./pages/ScannerPage";
import NiftyScanPage from "./pages/NiftyScanPage";
import ChartPage from "./pages/ChartPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/callback" element={<CallbackPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/scanner/:type" element={<ScannerPage />} />
      <Route path="/nifty-scan" element={<NiftyScanPage />} />
      <Route path="/chart" element={<ChartPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
