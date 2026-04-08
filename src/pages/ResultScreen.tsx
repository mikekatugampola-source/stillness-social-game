import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGameRoomContext } from "@/context/GameRoomContext";

const ResultScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { survivalTime } = (location.state as any) ?? {};
  const { room, playerId, leaveRoom } = useGameRoomContext();

  const loserName = room?.loserName ?? "Someone";
  const mode = room?.mode ?? "classic";
  const sharedDare = room?.dareText;

  const formatTime = (seconds: number) => {
    if (!seconds && seconds !== 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handlePlayAgain = () => {
    leaveRoom();
    navigate("/");
  };

  const handleShare = async () => {
    const text = `${loserName.toUpperCase()} LOST after ${formatTime(survivalTime ?? 0)}${
      mode === "dare" && sharedDare ? ` — ${sharedDare}` : ""
    }\n\nChallenge your friends 👉 Don't Touch`;

    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {}
    } else {
      await navigator.clipboard?.writeText(text);
    }
  };

  const outcomeText =
    mode === "dare" && sharedDare ? sharedDare : null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-background px-6 py-12">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="flex flex-col items-center justify-center flex-1 w-full max-w-sm gap-10"
      >
        <div className="flex-1" />

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-foreground font-bold tracking-tight leading-none text-center"
          style={{ fontSize: "clamp(3rem, 12vw, 5rem)" }}
        >
          {loserName.toUpperCase()} LOST
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.5 }}
          className="text-foreground font-light tracking-tight text-center"
          style={{ fontSize: "clamp(2.5rem, 8vw, 4rem)", fontVariantNumeric: "tabular-nums" }}
        >
          {formatTime(survivalTime ?? 0)}
        </motion.p>

        {outcomeText && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            transition={{ delay: 0.7 }}
            className="text-foreground text-center font-normal leading-relaxed"
            style={{ fontSize: "clamp(1.1rem, 4.5vw, 1.5rem)" }}
          >
            {outcomeText}
          </motion.p>
        )}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ delay: 1.0 }}
          className="text-foreground text-sm text-center tracking-wide"
        >
          Challenge your friends
        </motion.p>

        <div className="flex-1" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="flex flex-col items-center gap-3 w-full"
        >
          <Button onClick={handlePlayAgain} size="lg" className="w-full max-w-[280px]">
            Play Again
          </Button>
          <Button variant="outline" onClick={handleShare} size="sm" className="w-full max-w-[280px]">
            Share
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 1.3 }}
          className="text-foreground text-xs tracking-widest text-center pb-2"
        >
          Don't Touch
        </motion.p>
      </motion.div>
    </div>
  );
};

export default ResultScreen;
