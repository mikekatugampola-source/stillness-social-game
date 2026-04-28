import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useGameRoomContext } from "@/context/GameRoomContext";
import { playCountdownTick, playGameStartSound } from "@/lib/audioManager";

const COUNTDOWN_SECONDS = 5;

function getRemainingCount(countdownStartedAt: string | null, nowMs: number): number {
  if (!countdownStartedAt) return COUNTDOWN_SECONDS;
  const elapsedSeconds = Math.floor((nowMs - new Date(countdownStartedAt).getTime()) / 1000);
  return Math.max(0, Math.min(COUNTDOWN_SECONDS, COUNTDOWN_SECONDS - elapsedSeconds));
}

const Countdown = () => {
  const navigate = useNavigate();
  const { room, startGame, getSyncedNow } = useGameRoomContext();
  const [count, setCount] = useState(() => getRemainingCount(room?.countdownStartedAt ?? null, getSyncedNow()));
  const hasStartedGame = useRef(false);
  const lastTickedCount = useRef<number | null>(null);

  // Redirect if no room
  useEffect(() => {
    if (!room) {
      navigate("/", { replace: true });
    }
  }, [room, navigate]);

  // Sync countdown from shared timestamp — single source of truth
  useEffect(() => {
    if (room?.status !== "countdown") return;

    const tick = () => {
      const remaining = getRemainingCount(room.countdownStartedAt, getSyncedNow());
      setCount(remaining);

      // Play tick sound on each new number
        if (lastTickedCount.current !== remaining && remaining > 0) {
        lastTickedCount.current = remaining;
          void playCountdownTick(`countdown-${remaining}`);
      }
    };

    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [getSyncedNow, room?.countdownStartedAt, room?.status]);

  // Any client may request activation; the shared room state only changes when the backend timestamp is ready.
  useEffect(() => {
    if (count > 0 || room?.status !== "countdown" || hasStartedGame.current) return;
    hasStartedGame.current = true;
    void startGame();
  }, [count, room?.status, startGame]);

  // All players navigate when shared phase becomes playing
  useEffect(() => {
    if (room?.status === "arming") {
      navigate("/motion-permission", { replace: true });
    } else if (room?.status === "playing") {
      void playGameStartSound("room-status-active");
      navigate("/game", { replace: true });
    } else if (room?.status === "finished") {
      navigate("/result", { replace: true });
    }
  }, [room?.status, navigate]);

  return (
    <div className="screen-center">
      <AnimatePresence mode="wait">
        {count > 0 ? (
          <motion.span
            key={count}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.3 }}
            className="text-countdown text-foreground"
          >
            {count}
          </motion.span>
        ) : (
          <motion.span
            key="go"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.2 }}
            className="text-countdown text-foreground"
          >
            GO
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Countdown;
