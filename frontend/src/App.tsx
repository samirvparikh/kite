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
import AppLayout from "./layouts/AppLayout";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/chart" element={<Chart />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/nifty50-920-breakout" element={<Nifty921 />} />
          <Route path="/nifty50-930-breakout" element={<Breakout930 />} />
          <Route path="/nifty-option-bias" element={<OptionBias />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;