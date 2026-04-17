import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Callback from "./pages/Callback";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import Nifty921 from "./pages/Nifty921";
import Breakout930 from "./pages/Breakout930";
import OptionBias from "./pages/OptionBias";
import Chart from "./pages/Chart";
import Positions from "./pages/Positions";
import MyTodayChoice from "./pages/MyTodayChoice";
import AppLayout from "./layouts/AppLayout";
import Static5MinBreakout from "./pages/static/Static5MinBreakout";
import Static920Breakout from "./pages/static/Static920Breakout";
import Static930Breakout from "./pages/static/Static930Breakout";
import StaticCePeBias from "./pages/static/StaticCePeBias";
import StaticMyTodayChoice from "./pages/static/StaticMyTodayChoice";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/chart" element={<Chart />} />
        <Route path="/scanners/5min-breakout" element={<Static5MinBreakout />} />
        <Route path="/scanners/9-20-breakout" element={<Static920Breakout />} />
        <Route path="/scanners/9-30-breakout" element={<Static930Breakout />} />
        <Route path="/scanners/ce-pe-bias" element={<StaticCePeBias />} />
        <Route path="/scanners/my-today-choice" element={<StaticMyTodayChoice />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/nifty50-920-breakout" element={<Nifty921 />} />
          <Route path="/nifty50-930-breakout" element={<Breakout930 />} />
          <Route path="/nifty-option-bias" element={<OptionBias />} />
          <Route path="/my-today-choice" element={<MyTodayChoice />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;