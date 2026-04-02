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
  const [gameActive, setGameActive] = useState(false);
  const [settling, setSettling] = useState(true);
  const [settleProgress, setSettleProgress] = useState(0);
  const [movementDetected, setMovementDetected] = useState(false);
  const startTimeRef = useRef(Date.now());
  const settleDurationRef = useRef(2000 + Math.random() * 600); // 2.0–2.6s

  const me = players.find((p) => p.playerId === playerId);
  const playerName = me?.displayName ?? "You";

  useEffect(() => {
    if (!room) {
      navigate("/", { replace: true });
      return;
    }
    const duration = settleDurationRef.current;
    const settleStart = Date.now();

    // Animate progress during settle
    const progressInterval = setInterval(() => {
      const pct = Math.min(1, (Date.now() - settleStart) / duration);
      setSettleProgress(pct);
    }, 50);

    const timer = setTimeout(() => {
      clearInterval(progressInterval);
      setSettleProgress(1);
      setSettling(false);
      setGameActive(true);
      startTimeRef.current = Date.now();
    }, duration);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
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
    setMovementDetected(true);
    reportLoss(playerId, playerName);
  }, [gameActive, reportLoss, playerId, playerName]);

  const { isMonitoring, debug } = useMotionDetection(gameActive, handleMotion);

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
    setMovementDetected(true);
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

      {/* Debug overlay - dev only */}
      {import.meta.env.DEV && (
        <div className="absolute right-3 top-12 rounded-md bg-muted/80 px-3 py-2 text-left text-[10px] font-mono text-muted-foreground backdrop-blur max-w-[180px]">
          <div>native: {debug.isNative ? "YES" : "no"}</div>
          <div>perm: {debug.permissionState}</div>
          <div>listeners: {debug.listenersActive ? "YES" : "no"}</div>
          <div>events: {debug.eventCount}</div>
          <div>settle: {settling ? "YES" : "no"}</div>
          <div>baseline: {debug.accelDelta > 0 || !settling ? "YES" : "no"}</div>
          <div>monitoring: {isMonitoring ? "YES" : "no"}</div>
          <div className="mt-1 border-t border-muted-foreground/20 pt-1">
            raw ax: {debug.rawAccel.x}
          </div>
          <div>raw ay: {debug.rawAccel.y}</div>
          <div>raw az: {debug.rawAccel.z}</div>
          <div>raw β: {debug.rawTilt.beta}</div>
          <div>raw γ: {debug.rawTilt.gamma}</div>
          <div className="mt-1 border-t border-muted-foreground/20 pt-1">
            accel Δ: {debug.accelDelta}
          </div>
          <div>tilt Δ: {debug.tiltDelta}</div>
          <div>accel thresh: {debug.accelThreshold}</div>
          <div>tilt thresh: {debug.tiltThreshold}</div>
          <div>triggered: {debug.triggered ? "YES" : "no"}</div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="flex flex-col items-center gap-6"
      >
        {movementDetected ? (
          <span className="text-2xl font-bold text-destructive">MOVEMENT DETECTED</span>
        ) : settling ? (
          <div className="flex flex-col items-center gap-6">
            <p className="text-body text-lg text-foreground">Place your phone down</p>
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                <circle
                  cx="32" cy="32" r="28" fill="none"
                  stroke="hsl(var(--foreground))"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 28}
                  strokeDashoffset={2 * Math.PI * 28 * (1 - settleProgress)}
                  className="transition-[stroke-dashoffset] duration-100"
                />
              </svg>
            </div>
          </div>
        ) : (
          <>
            <span className="text-timer text-foreground">{formatTime(elapsed)}</span>
            <p className={`text-caption text-sm ${isMonitoring ? "animate-pulse-slow" : ""}`}>
              {isMonitoring ? "Monitoring motion" : "Calibrating..."}
            </p>
            <p className="text-caption mt-8 text-xs">Leave your phone face down</p>
          </>
        )}

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
