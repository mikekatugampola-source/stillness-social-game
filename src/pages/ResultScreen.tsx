import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGameRoomContext } from "@/context/GameRoomContext";
import { toast } from "sonner";

const TIKTOK_APP_URL = "snssdk1233://";
const TIKTOK_WEB_URL = "https://www.tiktok.com";
const CAPTION_TEXT = "Last to touch their phone wins… I lost 💀 #donttouchchallenge";

const ResultScreen = () => {
  const navigate = useNavigate();
  const { leaveRoom } = useGameRoomContext();

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
      await navigator.clipboard.writeText(CAPTION_TEXT);
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
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.3 }}
          className="text-foreground text-center font-light"
          style={{ fontSize: "clamp(1rem, 4vw, 1.25rem)" }}
        >
          This is definitely going on TikTok
        </motion.p>

        <div className="flex-1" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col items-center gap-3 w-full"
        >
          <Button onClick={handleOpenTikTok} size="lg" className="w-full max-w-[280px]">
            Open TikTok
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
          Tag @donttouchapp for a chance to be featured 👀
        </motion.p>
      </motion.div>
    </div>
  );
};

export default ResultScreen;
