import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGameRoom } from "@/hooks/useGameRoom";
import type { GameMode } from "@/lib/game-types";

const modes: { id: GameMode; label: string; subtitle: string }[] = [
  { id: "classic", label: "Classic", subtitle: "Pure willpower" },
  { id: "punishment", label: "Punishment", subtitle: "Loser gets a dare" },
  { id: "drinks", label: "Drinks", subtitle: "Loser takes a sip" },
];

const WaitingRoom = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerId, playerName, isHost } = (location.state as any) ?? {};

  const {
    room,
    players,
    toggleReady,
    updateMode,
    startCountdown,
    leaveRoom,
    joinRoom,
    createRoom,
  } = useGameRoom();

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!roomCode || initialized) return;
    setInitialized(true);

    if (isHost) {
      createRoom(playerName).then(() => {});
    } else {
      joinRoom(roomCode, playerName).then(() => {});
    }
  }, [roomCode, initialized, isHost, playerName, createRoom, joinRoom]);

  // Listen for countdown
  useEffect(() => {
    if (room?.status === "countdown") {
      navigate("/countdown", {
        state: {
          roomCode: room.code,
          playerId,
          playerName,
          isHost,
          mode: room.mode,
        },
      });
    }
  }, [room?.status, navigate, room?.code, playerId, playerName, isHost, room?.mode]);

  const me = players.find((p) => p.id === playerId);
  const canStart = isHost && players.length >= 2 && players.filter((p) => !p.is_host).every((p) => p.is_ready);
  const currentMode = room?.mode ?? "classic";

  const handleLeave = () => {
    leaveRoom();
    navigate("/");
  };

  const handleStart = () => {
    startCountdown();
  };

  const displayCode = room?.code ?? roomCode ?? "----";

  return (
    <div className="screen-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex w-full max-w-sm flex-col items-center gap-8"
      >
        {/* Room Code */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-caption uppercase tracking-widest">Room Code</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-foreground">{displayCode}</p>
        </div>

        {/* Mode Selector (host only) */}
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

        {/* Mode display (non-host) */}
        {!isHost && (
          <div className="glass-card w-full text-center">
            <p className="text-caption">Mode</p>
            <p className="mt-1 text-lg font-semibold text-foreground capitalize">{currentMode}</p>
          </div>
        )}

        {/* Players */}
        <div className="w-full">
          <p className="text-caption mb-3">Players ({players.length})</p>
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {players.map((player) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base font-medium text-foreground">
                      {player.name}
                    </span>
                    {player.is_host && (
                      <span className="rounded-md bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Host
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      player.is_ready || player.is_host ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {player.is_host ? "Ready" : player.is_ready ? "Ready" : "Waiting"}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Actions */}
        <div className="flex w-full flex-col gap-3">
          {!isHost && (
            <Button
              onClick={toggleReady}
              variant={me?.is_ready ? "secondary" : "default"}
              size="lg"
              className="w-full"
            >
              {me?.is_ready ? "Not Ready" : "Ready"}
            </Button>
          )}

          {isHost && (
            <Button
              onClick={handleStart}
              disabled={!canStart}
              size="lg"
              className="w-full"
            >
              Start Game
            </Button>
          )}

          <Button variant="ghost" onClick={handleLeave} size="sm">
            Leave
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default WaitingRoom;
