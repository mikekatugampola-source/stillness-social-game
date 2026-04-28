import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";
import { unlockAudio } from "@/lib/audioManager";
import { useGameRoomContext } from "@/context/GameRoomContext";

const needsPermissionRequest = () => {
  return (
    (typeof DeviceOrientationEvent !== "undefined" &&
      "requestPermission" in DeviceOrientationEvent) ||
    (typeof DeviceMotionEvent !== "undefined" &&
      "requestPermission" in DeviceMotionEvent)
  );
};

const MotionPermission = () => {
  const navigate = useNavigate();
  const { room, playerId, markMotionEnabled } = useGameRoomContext();
  const [status, setStatus] = useState<"prompt" | "denied" | "granted">("prompt");
  const [loading, setLoading] = useState(false);
  const hasMarkedMotionEnabled = useRef(false);

  const me = room?.players.find((player) => player.playerId === playerId);
  const isWaitingForPlayers = room?.status === "arming" && (status === "granted" || me?.motionEnabled);

  const confirmMotionEnabled = useCallback(async () => {
    if (hasMarkedMotionEnabled.current) return;
    hasMarkedMotionEnabled.current = true;
    await markMotionEnabled();
  }, [markMotionEnabled]);

  // If platform doesn't need explicit permission, mark this player ready for the shared countdown.
  useEffect(() => {
    if (!room) {
      navigate("/", { replace: true });
      return;
    }

    if (room.status === "countdown") {
      navigate("/countdown", { replace: true });
      return;
    }

    if (room.status === "playing") {
      navigate("/game", { replace: true });
      return;
    }

  }, [confirmMotionEnabled, navigate, room]);

  const handleEnable = useCallback(async () => {
    setLoading(true);
    let granted = true;

    // Fire-and-forget: audio unlock must NEVER block game progression
    unlockAudio("motion-permission-enable").catch(() => {});

    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      "requestPermission" in DeviceOrientationEvent
    ) {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        if (result !== "granted") granted = false;
      } catch {
        granted = false;
      }
    }

    if (
      granted &&
      typeof DeviceMotionEvent !== "undefined" &&
      "requestPermission" in DeviceMotionEvent
    ) {
      try {
        const result = await (DeviceMotionEvent as any).requestPermission();
        if (result !== "granted") granted = false;
      } catch {
        granted = false;
      }
    }

    setLoading(false);

    if (granted) {
      setStatus("granted");
      await confirmMotionEnabled();
    } else {
      setStatus("denied");
    }
  }, [confirmMotionEnabled]);

  if (isWaitingForPlayers) {
    return (
      <div className="screen-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-6 px-8 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Smartphone className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-title text-foreground">Motion Enabled</h1>
          <p className="text-caption text-sm max-w-[280px]">
            Waiting for other players…
          </p>
        </motion.div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="screen-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-6 px-8 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Smartphone className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-title text-foreground">Motion Access Required</h1>
          <p className="text-caption text-sm max-w-[280px]">
            Motion access is required to play. Please enable it in your device settings and try again.
          </p>
          <Button onClick={handleEnable} variant="outline" disabled={loading}>
            {loading ? "Requesting…" : "Try Again"}
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="screen-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-6 px-8 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Smartphone className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-title text-foreground">Enable Motion</h1>
        <p className="text-caption text-sm max-w-[280px]">
          We use motion to detect who moves first
        </p>
        <Button onClick={handleEnable} className="mt-2 min-w-[200px]" disabled={loading}>
          {loading ? "Requesting…" : "Enable Motion"}
        </Button>
      </motion.div>
    </div>
  );
};

export default MotionPermission;
