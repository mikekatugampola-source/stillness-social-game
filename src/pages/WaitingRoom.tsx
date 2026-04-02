import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGameRoomContext } from "@/context/GameRoomContext";
import type { GameMode } from "@/lib/game-types";
import { punishments } from "@/lib/punishments";

const modes: { id: GameMode; label: string; subtitle: string }[] = [
  { id: "classic", label: "Classic", subtitle: "Pure willpower" },
  { id: "punishment", label: "Punishment", subtitle: "Loser gets a dare" },
  { id: "drinks", label: "Drinks", subtitle: "Loser takes a sip" },
];

const WaitingRoom = () => {
  const navigate = useNavigate();
  const { room, playerId, toggleReady, updateMode, updatePunishment, startCountdown, leaveRoom } =
    useGameRoomContext();
  const [customPunishment, setCustomPunishment] = useState("");

  useEffect(() => {
    if (!room) navigate("/", { replace: true });
  }, [room, navigate]);

  useEffect(() => {
    if (room?.status === "countdown") {
      navigate("/countdown", { replace: true });
    }
  }, [room?.status, navigate]);

  if (!room) return null;

  const players = room.players;
  const me = players.find((p) => p.playerId === playerId);
  const isHost = me?.isHost ?? room.hostId === playerId;
  const currentMode = room.mode;
  const hasPunishment = currentMode !== "punishment" || !!room.punishmentText?.trim();
  const canStart = players.length >= 2 && players.every((p) => p.isReady) && hasPunishment;

  const handleLeave = () => {
    leaveRoom();
    navigate("/");
  };

  const handleSelectPreset = (text: string) => {
    setCustomPunishment("");
    void updatePunishment(text);
  };

  const handleCustomSubmit = () => {
    const trimmed = customPunishment.trim();
    if (trimmed) void updatePunishment(trimmed);
  };

  return (
    <div className="screen-center">
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

        {/* Punishment setup — host picks, all players see */}
        {currentMode === "punishment" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="w-full"
          >
            {isHost ? (
              <div className="flex flex-col gap-3">
                <p className="text-caption uppercase tracking-widest">Choose Punishment</p>
                <div className="flex gap-2">
                  <Input
                    value={customPunishment}
                    onChange={(e) => setCustomPunishment(e.target.value)}
                    placeholder="Type a custom punishment…"
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCustomSubmit}
                    disabled={!customPunishment.trim()}
                  >
                    Set
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {punishments.map((p) => (
                    <button
                      key={p}
                      onClick={() => handleSelectPreset(p)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                        room.punishmentText === p
                          ? "border-foreground bg-foreground/10 text-foreground"
                          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="glass-card w-full text-center">
                <p className="text-caption text-[10px] uppercase tracking-widest mb-1">Punishment</p>
                <p className="text-sm font-medium text-foreground">
                  {room.punishmentText || "Host is choosing…"}
                </p>
              </div>
            )}

            {room.punishmentText && isHost && (
              <div className="mt-2 rounded-lg border border-foreground/20 bg-foreground/5 px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Selected</p>
                <p className="text-xs font-medium text-foreground">{room.punishmentText}</p>
              </div>
            )}
          </motion.div>
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
                  <span
                    className={`text-xs font-medium ${
                      player.isReady ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {player.isReady ? "Ready" : "Waiting"}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          {!isHost && (
            <Button
              onClick={toggleReady}
              variant={me?.isReady ? "secondary" : "default"}
              size="lg"
              className="w-full"
            >
              {me?.isReady ? "Unready" : "Ready"}
            </Button>
          )}

          {isHost && (
            <>
              <Button
                onClick={() => void startCountdown()}
                disabled={!canStart}
                size="lg"
                className="w-full"
              >
                Start Game
              </Button>
              {!canStart && (
                <p className="text-center text-xs text-muted-foreground">
                  {!hasPunishment
                    ? "Select a punishment to start"
                    : "Waiting for all players to be ready"}
                </p>
              )}
            </>
          )}

          <Button variant="ghost" onClick={handleLeave} size="sm">
            Leave
          </Button>
        </div>

        <details
          className="w-full rounded-xl border border-border/60 bg-secondary/60 p-3 text-left text-[10px] text-muted-foreground"
          aria-label="Room debug info"
        >
          <summary className="cursor-pointer select-none text-caption tracking-[0.2em]">Debug</summary>
          <div className="mt-3 space-y-2 break-all">
            <p>roomCode: {room.roomCode}</p>
            <p>playerCount: {room.players.length}</p>
            <p>mode: {room.mode}</p>
            <p>hostId: {room.hostId}</p>
            <p>punishmentText: {room.punishmentText ?? "(none)"}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(room.players, null, 2)}</pre>
          </div>
        </details>
      </motion.div>
    </div>
  );
};

export default WaitingRoom;
