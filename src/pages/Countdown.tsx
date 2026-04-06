import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useGameRoomContext } from "@/context/GameRoomContext";

const COUNTDOWN_SECONDS = 5;

function getRemainingCount(countdownStartedAt: string | null): number {
  if (!countdownStartedAt) return COUNTDOWN_SECONDS;
  const elapsedSeconds = Math.floor((Date.now() - new Date(countdownStartedAt).getTime()) / 1000);
  return Math.max(0, COUNTDOWN_SECONDS - elapsedSeconds);
}

const Countdown = () => {
  const navigate = useNavigate();
  const { room, playerId, startGame } = useGameRoomContext();
  const [count, setCount] = useState(() => getRemainingCount(room?.countdownStartedAt ?? null));
  const hasStartedGame = useRef(false);

  const isHost =
    room?.players.some((player) => player.playerId === playerId && player.isHost) ?? false;

  useEffect(() => {
    if (!room) {
      navigate("/", { replace: true });
    }
  }, [room, navigate]);

  // Sync countdown from shared timestamp
  useEffect(() => {
    if (room?.status !== "countdown") return;

    const tick = () => {
      setCount(getRemainingCount(room.countdownStartedAt));
    };

    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [room?.countdownStartedAt, room?.status]);

  // Host starts game when countdown reaches 0
  useEffect(() => {
    if (count > 0 || !isHost || hasStartedGame.current) return;
    hasStartedGame.current = true;
    void startGame();
  }, [count, isHost, startGame]);

  // All players navigate when status becomes active
  useEffect(() => {
    if (room?.status === "active") {
      navigate("/game", { replace: true });
    }
  }, [room?.status, navigate]);

  return (
    <div className="screen-center">
      <AnimatePresence mode="wait">
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
      </AnimatePresence>
    </div>
  );
};

export default Countdown;
