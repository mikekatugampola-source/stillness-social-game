import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useGameRoomContext } from "@/context/GameRoomContext";

const Countdown = () => {
  const navigate = useNavigate();
  const { room, startGame } = useGameRoomContext();
  const [count, setCount] = useState(3);

  const me = room ? true : false;
  const isHost = true; // countdown logic is the same for all

  useEffect(() => {
    if (!room) {
      navigate("/", { replace: true });
      return;
    }
  }, [room, navigate]);

  useEffect(() => {
    if (count <= 0) {
      startGame();
      navigate("/game", { replace: true });
      return;
    }

    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, navigate, startGame]);

  // Listen for playing state from broadcast
  useEffect(() => {
    if (room?.status === "playing") {
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
