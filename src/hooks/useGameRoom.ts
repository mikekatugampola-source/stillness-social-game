import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameMode, Player, GameRoom } from "@/lib/game-types";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateId(): string {
  return crypto.randomUUID();
}

export function useGameRoom() {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  // Store local player data so actions don't depend on presence sync
  const localPlayerRef = useRef<{ id: string; name: string; is_host: boolean; is_ready: boolean; mode?: GameMode }>({
    id: "", name: "", is_host: false, is_ready: false,
  });

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const subscribeToRoom = useCallback(
    (roomCode: string, myId: string) => {
      cleanup();
      const channel = supabase.channel(`room:${roomCode}`, {
        config: { presence: { key: myId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const presenceState = channel.presenceState();
          const playerList: Player[] = [];
          Object.entries(presenceState).forEach(([_key, presences]) => {
            const p = (presences as any[])[0];
            if (p) {
              playerList.push({
                id: p.id,
                name: p.name,
                is_ready: p.is_ready ?? false,
                is_host: p.is_host ?? false,
              });
              // Extract mode from host's presence data
              if (p.is_host && p.mode) {
                setRoom((prev) => prev ? { ...prev, mode: p.mode } : prev);
              }
            }
          });
          setPlayers(playerList);
        })
        .on("broadcast", { event: "game_update" }, ({ payload }) => {
          setRoom((prev) => (prev ? { ...prev, ...payload } : prev));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            // Will track after join
          }
        });

      channelRef.current = channel;
      return channel;
    },
    [cleanup]
  );

  const createRoom = useCallback(
    async (hostName: string, mode: GameMode = "classic") => {
      const id = generateId();
      const code = generateCode();
      const hostId = generateId();

      const newRoom: GameRoom = {
        id,
        code,
        status: "waiting",
        mode,
        host_id: hostId,
        loser_id: null,
        loser_name: null,
        started_at: null,
        ended_at: null,
      };

      setRoom(newRoom);
      setPlayerId(hostId);
      setError(null);
      localPlayerRef.current = { id: hostId, name: hostName, is_host: true, is_ready: false, mode };

      const channel = subscribeToRoom(code, hostId);

      // Small delay to ensure subscription is ready
      await new Promise((r) => setTimeout(r, 500));

      await channel.track({
        id: hostId,
        name: hostName,
        is_ready: false,
        is_host: true,
        mode,
      });

      return { room: newRoom, playerId: hostId };
    },
    [subscribeToRoom]
  );

  const joinRoom = useCallback(
    async (code: string, playerName: string) => {
      const pid = generateId();
      setPlayerId(pid);
      setError(null);
      localPlayerRef.current = { id: pid, name: playerName, is_host: false, is_ready: false };

      const joinedRoom: GameRoom = {
        id: generateId(),
        code: code.toUpperCase(),
        status: "waiting",
        mode: "classic",
        host_id: "",
        loser_id: null,
        loser_name: null,
        started_at: null,
        ended_at: null,
      };
      setRoom(joinedRoom);

      const channel = subscribeToRoom(code.toUpperCase(), pid);

      await new Promise((r) => setTimeout(r, 500));

      await channel.track({
        id: pid,
        name: playerName,
        is_ready: false,
        is_host: false,
      });

      return { playerId: pid };
    },
    [subscribeToRoom]
  );

  const toggleReady = useCallback(async () => {
    if (!channelRef.current || !playerId) return;
    const me = players.find((p) => p.id === playerId);
    if (!me) return;
    await channelRef.current.track({
      id: me.id,
      name: me.name,
      is_ready: !me.is_ready,
      is_host: me.is_host,
    });
  }, [playerId, players]);

  const updateMode = useCallback(
    (mode: GameMode) => {
      setRoom((prev) => (prev ? { ...prev, mode } : prev));
      // Re-track host presence with updated mode so all players get it via sync
      if (channelRef.current) {
        const me = players.find((p) => p.id === playerId);
        if (me) {
          channelRef.current.track({
            id: me.id,
            name: me.name,
            is_ready: me.is_ready,
            is_host: me.is_host,
            mode,
          });
        }
        // Also broadcast for immediate update
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: { mode },
        });
      }
    },
    [players, playerId]
  );

  const startCountdown = useCallback(() => {
    const update = { status: "countdown" as const, started_at: new Date().toISOString() };
    setRoom((prev) => (prev ? { ...prev, ...update } : prev));
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "game_update",
        payload: update,
      });
    }
  }, []);

  const startGame = useCallback(() => {
    const update = { status: "playing" as const };
    setRoom((prev) => (prev ? { ...prev, ...update } : prev));
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "game_update",
        payload: update,
      });
    }
  }, []);

  const reportLoss = useCallback(
    (loserId: string, loserName: string) => {
      const update = {
        status: "finished" as const,
        loser_id: loserId,
        loser_name: loserName,
        ended_at: new Date().toISOString(),
      };
      setRoom((prev) => (prev ? { ...prev, ...update } : prev));
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: update,
        });
      }
    },
    []
  );

  const leaveRoom = useCallback(() => {
    cleanup();
    setRoom(null);
    setPlayers([]);
    setPlayerId("");
  }, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    room,
    players,
    playerId,
    error,
    createRoom,
    joinRoom,
    toggleReady,
    updateMode,
    startCountdown,
    startGame,
    reportLoss,
    leaveRoom,
  };
}
