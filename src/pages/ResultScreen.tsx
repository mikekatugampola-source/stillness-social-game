import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGameRoomContext } from "@/context/GameRoomContext";

const ResultScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { survivalTime } = (location.state as any) ?? {};
  const { room, playerId, leaveRoom } = useGameRoomContext();

  const isMe = room?.loserId === playerId;
  const loserName = room?.loserName ?? "Someone";
  const mode = room?.mode ?? "classic";
  const sharedPunishment = room?.punishmentText;
  const sharedDrinks = room?.drinksText;

  const formatTime = (seconds: number) => {
    if (!seconds && seconds !== 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleHome = () => { leaveRoom(); navigate("/"); };

  return (
    <div className="screen-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center gap-6"
      >
        <h1 className="text-display">
          {isMe ? "You lost" : `${loserName} lost`}
        </h1>
        <p className="text-caption text-lg">
          {isMe ? "You moved first" : "They moved first"}
        </p>

        <div className="mt-4 flex flex-col items-center gap-1">
          <p className="text-caption text-xs uppercase tracking-widest">Survival Time</p>
          <p className="text-3xl font-light text-foreground tracking-tight">
            {formatTime(survivalTime ?? 0)}
          </p>
        </div>

        {mode === "punishment" && sharedPunishment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="glass-card mt-4 max-w-xs text-center"
          >
            <p className="text-caption text-[10px] uppercase tracking-widest mb-2">Punishment</p>
            <p className="text-base font-medium text-foreground leading-relaxed">{sharedPunishment}</p>
          </motion.div>
        )}

        {mode === "drinks" && sharedDrinks && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="glass-card mt-4 max-w-xs text-center"
          >
            <p className="text-caption text-[10px] uppercase tracking-widest mb-2">Drinks</p>
            <p className="text-base font-medium text-foreground leading-relaxed">{sharedDrinks}</p>
          </motion.div>
        )}

        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <Button onClick={handleHome} size="lg" className="w-full">Play Again</Button>
          <Button variant="ghost" onClick={handleHome} size="sm">Back to Home</Button>
        </div>
      </motion.div>
    </div>
  );
};

export default ResultScreen;
