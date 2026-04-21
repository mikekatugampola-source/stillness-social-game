import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGameRoomContext } from "@/context/GameRoomContext";
import { toast } from "sonner";

const TIKTOK_APP_URL = "snssdk1233://";
const TIKTOK_WEB_URL = "https://www.tiktok.com";

const LOSER_CAPTION = "I lost 💀 now I have to do this… #donttouchchallenge";
const buildWinnerCaption = (loserName?: string) =>
  `${loserName?.trim() || "someone"} lost 💀 now they have to do this… #donttouchchallenge`;

const ResultScreen = () => {
  const navigate = useNavigate();
  const { room, playerId, leaveRoom } = useGameRoomContext();

  const isLoser = room?.loserId === playerId;
  const loserName = room?.loserName;
  const winnerTitle = loserName ? `${loserName} lost 💀` : "Someone lost 💀";
  const dareText = room?.dareText?.trim();

  const handleOpenTikTok = () => {
    const timeout = setTimeout(() => {
      window.open(TIKTOK_WEB_URL, "_blank");
    }, 500);

    const handleBlur = () => {
      clearTimeout(timeout);
      window.removeEventListener("blur", handleBlur);
    };
    window.addEventListener("blur", handleBlur);

    window.location.href = TIKTOK_APP_URL;
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(isLoser ? LOSER_CAPTION : buildWinnerCaption(loserName));
      toast.success("Caption copied!");
    } catch {
      toast.error("Couldn't copy — try manually");
    }
  };

  const handlePlayAgain = () => {
    leaveRoom();
    navigate("/");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-background px-6 py-12">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center flex-1 w-full max-w-sm gap-8"
      >
        <div className="flex-1" />

        {isLoser ? (
          <>
            <motion.h1
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-foreground font-bold tracking-tight leading-none text-center"
              style={{ fontSize: "clamp(3rem, 12vw, 5rem)" }}
            >
              You lost 💀
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ delay: 0.3 }}
              className="text-foreground text-center font-semibold"
              style={{ fontSize: "clamp(1.25rem, 5vw, 1.75rem)" }}
            >
              Do the dare.
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 0.45 }}
              className="text-foreground text-center font-light"
              style={{ fontSize: "clamp(0.875rem, 3.5vw, 1.1rem)" }}
            >
              They're filming you.
            </motion.p>
          </>
        ) : (
          <>
            <motion.h1
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-foreground font-bold tracking-tight leading-none text-center"
              style={{ fontSize: "clamp(2.5rem, 10vw, 4.5rem)" }}
            >
              {winnerTitle}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ delay: 0.3 }}
              className="text-foreground text-center font-semibold"
              style={{ fontSize: "clamp(1.25rem, 5vw, 1.75rem)" }}
            >
              Film this. Post it.
            </motion.p>

            {dareText && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="w-full rounded-xl border border-border bg-card px-5 py-4 text-center"
              >
                <p
                  className="text-foreground font-semibold leading-snug"
                  style={{ fontSize: "clamp(1rem, 4.2vw, 1.25rem)" }}
                >
                  <span className="opacity-60">Dare: </span>
                  {dareText}
                </p>
              </motion.div>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 0.5 }}
              className="text-foreground text-center font-light"
              style={{ fontSize: "clamp(0.875rem, 3.5vw, 1.1rem)" }}
            >
              Don't let them off easy.
            </motion.p>


          </>
        )}

        <div className="flex-1" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col items-center gap-3 w-full"
        >
          <Button onClick={handleOpenTikTok} size="lg" className="w-full max-w-[280px]">
            Post this
          </Button>
          <Button variant="outline" onClick={handleCopyCaption} size="sm" className="w-full max-w-[280px]">
            Copy Caption
          </Button>
          <Button variant="ghost" onClick={handlePlayAgain} size="sm" className="w-full max-w-[280px]">
            Play Again
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          transition={{ delay: 0.6 }}
          className="text-foreground text-xs tracking-wide text-center pb-2"
        >
          Post this. Tag @donttouchapp. #donttouchchallenge
        </motion.p>
      </motion.div>
    </div>
  );
};

export default ResultScreen;
