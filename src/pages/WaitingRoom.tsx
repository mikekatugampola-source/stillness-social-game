import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGameRoomContext } from "@/context/GameRoomContext";
import { unlockAudio } from "@/lib/audioManager";
import RulePicker from "@/components/RulePicker";
import type { GameMode } from "@/lib/game-types";
import { dares } from "@/lib/punishments";

const modes: { id: GameMode; label: string; subtitle: string }[] = [
  { id: "classic", label: "Classic", subtitle: "Pure willpower" },
  { id: "dare", label: "Dare", subtitle: "Loser gets a dare" },
];

const WaitingRoom = () => {
  const navigate = useNavigate();
  const {
    room, playerId, toggleReady, updateMode, updateDare,
    startCountdown, leaveRoom,
  } = useGameRoomContext();

  useEffect(() => {
    if (!room) navigate("/", { replace: true });
  }, [room, navigate]);

  useEffect(() => {
    if (room?.status === "arming" || room?.status === "countdown") {
      navigate("/motion-permission", { replace: true });
    }
  }, [room?.status, navigate]);

  if (!room) return null;

  const players = room.players;
  const me = players.find((p) => p.playerId === playerId);
  const isHost = me?.isHost ?? room.hostId === playerId;
  const currentMode = room.mode;
  const hasDare = currentMode !== "dare" || !!room.dareText?.trim();
  const canStart = players.length >= 2 && players.every((p) => p.isReady) && hasDare;

  const handleLeave = () => { leaveRoom(); navigate("/"); };

  const handleReady = async () => {
    void unlockAudio("waiting-room-ready");
    await toggleReady();
  };

  const handleStart = async () => {
    void unlockAudio("waiting-room-start");
    await startCountdown();
  };

  return (
    <div className="min-h-[100dvh] w-full overflow-y-auto px-4 py-8 flex justify-center" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex w-full max-w-sm flex-col items-center gap-8"
      >
        <div className="flex flex-col items-center gap-2">
          <p className="text-caption uppercase tracking-widest">Room Code</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-foreground">{room.roomCode}</p>
        </div>

        {isHost && (
          <div className="flex w-full gap-2">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => updateMode(mode.id)}
                className={`flex-1 rounded-xl border px-3 py-3 text-center transition-all ${
                  currentMode === mode.id
                    ? "border-foreground bg-foreground/10"
                    : "border-border bg-secondary"
                }`}
              >
                <p className="text-xs font-semibold text-foreground">{mode.label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{mode.subtitle}</p>
              </button>
            ))}
          </div>
        )}

        {!isHost && (
          <div className="glass-card w-full text-center">
            <p className="text-caption">Mode</p>
            <p className="mt-1 text-lg font-semibold capitalize text-foreground">{currentMode}</p>
          </div>
        )}

        {currentMode === "dare" && (
          <RulePicker
            label="Choose Dare"
            presets={dares}
            selected={room.dareText}
            isHost={isHost}
            showCustomInput
            onSelect={(t) => void updateDare(t)}
          />
        )}

        <div className="w-full">
          <p className="mb-3 text-caption">Players ({players.length})</p>
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {players.map((player) => (
                <motion.div
                  key={player.playerId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base font-medium text-foreground">{player.displayName}</span>
                    {player.isHost && (
                      <span className="rounded-md bg-foreground/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Host
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${player.isReady ? "text-foreground" : "text-muted-foreground"}`}>
                    {player.isReady ? "Ready" : "Waiting"}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          {!isHost && (
            <Button onClick={handleReady} variant={me?.isReady ? "secondary" : "default"} size="lg" className="w-full">
              {me?.isReady ? "Unready" : "Ready"}
            </Button>
          )}
          {isHost && (
            <>
              <Button onClick={handleStart} disabled={!canStart} size="lg" className="w-full">
                Start Game
              </Button>
              {!canStart && (
                <p className="text-center text-xs text-muted-foreground">
                  {players.length < 2
                    ? "Need at least 2 players"
                    : !hasDare
                      ? "Select a dare to start"
                      : "Waiting for all players to be ready"}
                </p>
              )}
            </>
          )}
          <Button variant="ghost" onClick={handleLeave} size="sm">Leave</Button>
        </div>

        {/* Safety disclaimer */}
        <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed max-w-[280px]">
          Play responsibly. Respect others. Keep challenges safe.
          {currentMode === "dare" && " User-generated dares do not reflect the app's views. Keep dares safe and appropriate."}
        </p>
      </motion.div>
    </div>
  );
};

export default WaitingRoom;
