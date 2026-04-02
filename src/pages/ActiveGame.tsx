import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMotionDetection } from "@/hooks/useMotionDetection";
import { useGameRoomContext } from "@/context/GameRoomContext";

const ActiveGame = () => {
  const navigate = useNavigate();
  const { room, playerId, players, reportLoss } = useGameRoomContext();

  const [elapsed, setElapsed] = useState(0);
  const [gameActive, setGameActive] = useState(true);
  const startTimeRef = useRef(Date.now());

  const me = players.find((p) => p.playerId === playerId);
  const playerName = me?.displayName ?? "You";

  useEffect(() => {
    if (!room) {
      navigate("/", { replace: true });
      return;
    }
  }, [room, navigate]);

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

  const { isMonitoring, requestPermission } = useMotionDetection(gameActive, handleMotion);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  // Listen for game finish
  useEffect(() => {
    if (room?.status === "finished") {
      navigate("/result", {
        replace: true,
        state: { survivalTime: elapsed },
      });
    }
  }, [room?.status, navigate, elapsed]);

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
        <span className="text-timer text-foreground">{formatTime(elapsed)}</span>

        <p className={`text-caption text-sm ${isMonitoring ? "animate-pulse-slow" : ""}`}>
          {isMonitoring ? "Monitoring motion" : "Calibrating..."}
        </p>

        <p className="text-caption mt-8 text-xs">Leave your phone face down</p>

        {import.meta.env.DEV && (
          <button
            onClick={handleEndGame}
            className="mt-10 rounded-md border border-muted-foreground/30 px-4 py-2 text-xs text-muted-foreground active:bg-muted/20"
          >
            Simulate Movement
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default ActiveGame;
