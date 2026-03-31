import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMotionDetection } from "@/hooks/useMotionDetection";
import { useGameRoom } from "@/hooks/useGameRoom";

const ActiveGame = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerId, playerName, isHost, mode } = (location.state as any) ?? {};
  const { room, reportLoss, leaveRoom, players } = useGameRoom();

  const [elapsed, setElapsed] = useState(0);
  const [gameActive, setGameActive] = useState(true);
  const startTimeRef = useRef(Date.now());

  // Timer
  useEffect(() => {
    if (!gameActive) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [gameActive]);

  const handleMotion = useCallback(() => {
    if (!gameActive) return;
    setGameActive(false);
    reportLoss(playerId, playerName);
  }, [gameActive, reportLoss, playerId, playerName]);

  const { isMonitoring, requestPermission, hasPermission } = useMotionDetection(
    gameActive,
    handleMotion
  );

  // Request permission on mount
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // Listen for game finish (someone else lost)
  useEffect(() => {
    if (room?.status === "finished") {
      const survivalTime = elapsed;
      navigate("/result", {
        replace: true,
        state: {
          loserId: room.loser_id,
          loserName: room.loser_name,
          playerId,
          playerName,
          mode: room.mode ?? mode,
          survivalTime,
          roomCode,
          isHost,
        },
      });
    }
  }, [room?.status, navigate, room, elapsed, playerId, playerName, mode, roomCode, isHost]);

  const handleEndGame = () => {
    setGameActive(false);
    reportLoss(playerId, playerName);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="screen-center relative">
      {/* End Game */}
      <div className="absolute left-6 top-12">
        <Button variant="ghost" size="sm" onClick={handleEndGame}>
          End Game
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="flex flex-col items-center gap-6"
      >
        {/* Timer */}
        <span className="text-timer text-foreground">{formatTime(elapsed)}</span>

        {/* Status */}
        <p className={`text-caption text-sm ${isMonitoring ? "animate-pulse-slow" : ""}`}>
          {isMonitoring ? "Monitoring motion" : "Calibrating..."}
        </p>

        {/* Instruction */}
        <p className="text-caption mt-8 text-xs">Leave your phone face down</p>
      </motion.div>
    </div>
  );
};

export default ActiveGame;
