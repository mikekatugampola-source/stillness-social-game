import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMotionDetection } from "@/hooks/useMotionDetection";
import { useGameRoomContext } from "@/context/GameRoomContext";
import { triggerGameOverFeedback } from "@/lib/gameOverFeedback";
import { KeepAwake } from "@capacitor-community/keep-awake";

const SETTLE_DURATION_MS = 2750;

const ActiveGame = () => {
  const navigate = useNavigate();
  const { room, playerId, players, reportLoss } = useGameRoomContext();

  const [elapsed, setElapsed] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [settling, setSettling] = useState(true);
  const [settleProgress, setSettleProgress] = useState(0);
  const [movementDetected, setMovementDetected] = useState(false);
  const hasTriggeredFeedback = useRef(false);

  const me = players.find((p) => p.playerId === playerId);
  const playerName = me?.displayName ?? "You";

  // Keep screen awake during the active round so motion detection keeps working.
  useEffect(() => {
    if (!room || room.status === "finished") return;

    let wakeLock: any = null;
    let cancelled = false;
    let nativeKeptAwake = false;

    const request = async () => {
      // Native (iOS/Android via Capacitor) — equivalent to UIApplication.isIdleTimerDisabled = true
      try {
        await KeepAwake.keepAwake();
        nativeKeptAwake = true;
      } catch {
        // not on a native platform or plugin unavailable — fall through to web API
      }

      // Web Wake Lock API (PWA / browser)
      try {
        const nav: any = navigator;
        if (nav?.wakeLock?.request) {
          wakeLock = await nav.wakeLock.request("screen");
          if (cancelled && wakeLock?.release) {
            wakeLock.release().catch(() => {});
            wakeLock = null;
          }
        }
      } catch {
        // ignore — wake lock not available or denied
      }
    };

    request();

    // Re-acquire if visibility comes back (browsers auto-release on hide)
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !wakeLock) {
        request();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (wakeLock?.release) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
      if (nativeKeptAwake) {
        // Restore normal sleep behavior — equivalent to isIdleTimerDisabled = false
        KeepAwake.allowSleep().catch(() => {});
        nativeKeptAwake = false;
      }
    };
  }, [room?.status, room]);

  // Shared round start time — same for every player in the room.
  // Local motion-detection readiness (settling) does NOT start the timer.
  const roundStartMs = room?.roundStartedAt ? new Date(room.roundStartedAt).getTime() : null;

  useEffect(() => {
    if (!room) {
      navigate("/", { replace: true });
      return;
    }
    if (room.status === "arming") {
      navigate("/motion-permission", { replace: true });
      return;
    }
    if (room.status === "countdown") {
      navigate("/countdown", { replace: true });
      return;
    }
    if (!roundStartMs) return;

    const tick = () => {
      const pct = Math.min(1, Math.max(0, (Date.now() - roundStartMs) / SETTLE_DURATION_MS));
      setSettleProgress(pct);
      setSettling(pct < 1);
      setGameActive(pct >= 1 && room.status === "playing");
    };

    tick();
    const interval = setInterval(tick, 50);
    return () => {
      clearInterval(interval);
    };
  }, [room, navigate, roundStartMs]);

  // Timer — driven by the shared round start timestamp so every player sees the same elapsed time.
  useEffect(() => {
    if (!roundStartMs) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - roundStartMs) / 1000)));
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [roundStartMs]);

  const handleMotion = useCallback(() => {
    if (!gameActive || movementDetected) return;
    setGameActive(false);
    setMovementDetected(true);
    triggerGameOverFeedback();
    hasTriggeredFeedback.current = true;
    reportLoss(playerId, playerName);
  }, [gameActive, movementDetected, reportLoss, playerId, playerName]);

  const { isMonitoring, debug } = useMotionDetection(gameActive, handleMotion);
  const audioDebug = typeof window !== "undefined" ? window.__dontTouchAudioDebug : undefined;

  // Listen for game finish — trigger feedback on ALL devices
  useEffect(() => {
    if (room?.status === "finished") {
      // Only trigger feedback once per game
      if (!hasTriggeredFeedback.current) {
        triggerGameOverFeedback();
        hasTriggeredFeedback.current = true;
      }
      // Small delay so vibration/sound play before navigation
      const timeout = setTimeout(() => {
        navigate("/result", {
          replace: true,
          state: { survivalTime: elapsed },
        });
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [room?.status, navigate, elapsed]);

  const handleEndGame = () => {
    if (movementDetected) return;
    setGameActive(false);
    setMovementDetected(true);
    triggerGameOverFeedback();
    hasTriggeredFeedback.current = true;
    reportLoss(playerId, playerName);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="screen-center relative">
      <div className="absolute left-6 top-12">
        <Button variant="ghost" size="sm" onClick={handleEndGame}>
          End Game
        </Button>
      </div>

      {/* Debug overlay - dev only */}
      {import.meta.env.DEV && (
        <div className="absolute right-3 top-12 rounded-md bg-muted/80 px-3 py-2 text-left text-[10px] font-mono text-muted-foreground backdrop-blur max-w-[220px]">
          <div>native: {debug.isNative ? "YES" : "no"}</div>
          <div>perm: {debug.permissionState}</div>
          <div>listeners: {debug.listenersActive ? "YES" : "no"}</div>
          <div>events: {debug.eventCount}</div>
          <div>settle: {settling ? "YES" : "no"}</div>
          <div>baseline: {debug.accelDelta > 0 || !settling ? "YES" : "no"}</div>
          <div>monitoring: {isMonitoring ? "YES" : "no"}</div>
          <div className="mt-1 border-t border-muted-foreground/20 pt-1">
            raw ax: {debug.rawAccel.x}
          </div>
          <div>raw ay: {debug.rawAccel.y}</div>
          <div>raw az: {debug.rawAccel.z}</div>
          <div>raw β: {debug.rawTilt.beta}</div>
          <div>raw γ: {debug.rawTilt.gamma}</div>
          <div className="mt-1 border-t border-muted-foreground/20 pt-1">
            smooth accel: {debug.smoothedAccel}
          </div>
          <div>smooth tilt: {debug.smoothedTilt}</div>
          <div>accel thresh: {debug.accelThreshold}</div>
          <div>tilt thresh: {debug.tiltThreshold}</div>
          <div>triggered: {debug.triggered ? "YES" : "no"}</div>
          <div className="mt-1 border-t border-muted-foreground/20 pt-1">
            audio unlocked: {audioDebug?.unlocked ? "YES" : "no"}
          </div>
          <div>audio ctx: {audioDebug?.contextState ?? "unknown"}</div>
          <div>audio html: {audioDebug?.htmlPrimed ? "YES" : "no"}</div>
          <div>audio web: {audioDebug?.webAudioPrimed ? "YES" : "no"}</div>
          <div>audio loaded: {Object.values(audioDebug?.loaded ?? {}).filter(Boolean).length}/5</div>
          <div>audio trig: {audioDebug?.lastTrigger ?? "-"}</div>
          <div>audio play: {audioDebug?.lastPlayResult ?? "-"}</div>
          <div>audio err: {audioDebug?.lastError ?? "-"}</div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="flex flex-col items-center gap-6"
      >
        {movementDetected ? (
          <span className="text-2xl font-bold text-destructive">MOVEMENT DETECTED</span>
        ) : settling ? (
          <div className="flex flex-col items-center gap-8">
            <h1 className="text-4xl font-bold text-foreground">Ready?</h1>
            <p className="text-lg text-muted-foreground">Phone face up. Don't move.</p>
            <div className="relative w-12 h-12">
              <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                <circle
                  cx="32" cy="32" r="28" fill="none"
                  stroke="hsl(var(--foreground))"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 28}
                  strokeDashoffset={2 * Math.PI * 28 * (1 - settleProgress)}
                  className="transition-[stroke-dashoffset] duration-100"
                />
              </svg>
            </div>
          </div>
        ) : (
          <>
            <span className="text-timer text-foreground">{formatTime(elapsed)}</span>
            <p className={`text-caption text-sm ${isMonitoring ? "animate-pulse-slow" : ""}`}>
              {isMonitoring ? "Don't move." : "Calibrating..."}
            </p>
          </>
        )}

        {import.meta.env.DEV && (
          <button
            onClick={handleEndGame}
            className="mt-10 rounded-md border border-muted-foreground/30 px-4 py-2 text-xs text-muted-foreground active:bg-muted/20"
          >
            Simulate Movement
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default ActiveGame;
