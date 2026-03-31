import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getRandomPunishment, getRandomDrinkMessage } from "@/lib/punishments";
import { useMemo } from "react";

const ResultScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loserId, loserName, playerId, mode, survivalTime } = (location.state as any) ?? {};

  const isMe = loserId === playerId;

  const punishment = useMemo(() => getRandomPunishment(), []);
  const drinkMsg = useMemo(() => getRandomDrinkMessage(), []);

  const formatTime = (seconds: number) => {
    if (!seconds && seconds !== 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="screen-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center gap-6"
      >
        {/* Title */}
        <h1 className="text-display">
          {isMe ? "You lost" : `${loserName} lost`}
        </h1>
        <p className="text-caption text-lg">
          {isMe ? "You moved first" : "They moved first"}
        </p>

        {/* Survival time */}
        <div className="mt-4 flex flex-col items-center gap-1">
          <p className="text-caption text-xs uppercase tracking-widest">Survival Time</p>
          <p className="text-3xl font-light text-foreground tracking-tight">
            {formatTime(survivalTime)}
          </p>
        </div>

        {/* Mode-specific content */}
        {mode === "punishment" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="glass-card mt-4 max-w-xs text-center"
          >
            <p className="text-caption text-[10px] uppercase tracking-widest mb-2">Punishment</p>
            <p className="text-base font-medium text-foreground leading-relaxed">{punishment}</p>
          </motion.div>
        )}

        {mode === "drinks" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4"
          >
            <p className="text-lg text-foreground/80 italic">{drinkMsg}</p>
          </motion.div>
        )}

        {/* Actions */}
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <Button
            onClick={() => navigate("/")}
            size="lg"
            className="w-full"
          >
            Play Again
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")} size="sm">
            Back to Home
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default ResultScreen;
