import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useGameRoom } from "@/hooks/useGameRoom";

const Countdown = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerId, playerName, isHost, mode } = (location.state as any) ?? {};
  const { room, startGame, players } = useGameRoom();

  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      if (isHost) startGame();
      navigate("/game", {
        replace: true,
        state: { roomCode, playerId, playerName, isHost, mode },
      });
      return;
    }

    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, navigate, roomCode, playerId, playerName, isHost, mode, startGame]);

  // Also listen for game_update to start game for non-host
  useEffect(() => {
    if (room?.status === "playing") {
      navigate("/game", {
        replace: true,
        state: { roomCode, playerId, playerName, isHost, mode },
      });
    }
  }, [room?.status, navigate, roomCode, playerId, playerName, isHost, mode]);

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
