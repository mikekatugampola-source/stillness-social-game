import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GameRoomProvider } from "@/context/GameRoomContext";
import Home from "./pages/Home";
import HowItWorks from "./pages/HowItWorks";
import CreateTable from "./pages/CreateTable";
import JoinTable from "./pages/JoinTable";
import WaitingRoom from "./pages/WaitingRoom";
import Countdown from "./pages/Countdown";
import MotionPermission from "./pages/MotionPermission";
import ActiveGame from "./pages/ActiveGame";
import ResultScreen from "./pages/ResultScreen";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <GameRoomProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/create" element={<CreateTable />} />
            <Route path="/join" element={<JoinTable />} />
            <Route path="/waiting" element={<WaitingRoom />} />
            <Route path="/motion-permission" element={<MotionPermission />} />
            <Route path="/countdown" element={<Countdown />} />
            <Route path="/game" element={<ActiveGame />} />
            <Route path="/result" element={<ResultScreen />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </GameRoomProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
