import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameMode, GameRoom, GameStatus, RoomPlayer } from "@/lib/game-types";

type PresenceMeta = {
  playerId?: string;
  displayName?: string;
  isHost?: boolean;
  isReady?: boolean;
  joinedAt?: string;
  hostId?: string;
  mode?: GameMode;
  status?: GameStatus;
  id?: string;
  name?: string;
  is_host?: boolean;
  is_ready?: boolean;
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function parsePresencePlayer(meta: PresenceMeta): RoomPlayer | null {
  const playerId = meta.playerId ?? meta.id;
  if (!playerId) return null;

  return {
    playerId,
    displayName: meta.displayName ?? meta.name ?? "Player",
    isHost: parseBool(meta.isHost, parseBool(meta.is_host)),
    isReady: parseBool(meta.isReady, parseBool(meta.is_ready)),
    joinedAt: meta.joinedAt ?? nowIso(),
  };
}

export function useGameRoom() {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [playerId, setPlayerId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const roomRef = useRef<GameRoom | null>(null);
  const localPlayerRef = useRef<RoomPlayer | null>(null);

  const setRoomState = useCallback((nextRoom: GameRoom | null) => {
    roomRef.current = nextRoom;
    setRoom(nextRoom);
  }, []);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const toPresencePayload = useCallback((roomState: GameRoom, player: RoomPlayer) => {
    return {
      playerId: player.playerId,
      displayName: player.displayName,
      isHost: player.isHost,
      isReady: player.isReady,
      joinedAt: player.joinedAt,
      hostId: roomState.hostId,
      mode: roomState.mode,
      status: roomState.status,
    };
  }, []);

  const applyPresenceSync = useCallback((presenceState: Record<string, PresenceMeta[]>) => {
    const currentRoom = roomRef.current;
    if (!currentRoom) return;

    const allPresences = Object.values(presenceState).flatMap((entries) => entries as PresenceMeta[]);
    const playersMap = new Map<string, RoomPlayer>();
    let hostMeta: PresenceMeta | null = null;

    allPresences.forEach((meta) => {
      const player = parsePresencePlayer(meta);
      if (!player) return;

      playersMap.set(player.playerId, player);
      if (player.isHost) {
        hostMeta = meta;
      }
    });

    const fallbackLocalPlayer = localPlayerRef.current;
    const parsedPlayers = Array.from(playersMap.values()).sort((a, b) =>
      a.joinedAt.localeCompare(b.joinedAt)
    );

    const nextPlayers =
      parsedPlayers.length > 0
        ? parsedPlayers
        : fallbackLocalPlayer
          ? [fallbackLocalPlayer]
          : currentRoom.players;

    const hostIdFromPresence = hostMeta?.hostId ?? hostMeta?.playerId ?? hostMeta?.id;
    const hostIdFromPlayers = nextPlayers.find((player) => player.isHost)?.playerId;
    const nextHostId = hostIdFromPresence ?? currentRoom.hostId ?? hostIdFromPlayers ?? "";

    const normalizedPlayers = nextPlayers.map((player) => ({
      ...player,
      isHost: player.playerId === nextHostId,
    }));

    const nextRoom: GameRoom = {
      ...currentRoom,
      hostId: nextHostId,
      mode: hostMeta?.mode ?? currentRoom.mode,
      status: hostMeta?.status ?? currentRoom.status,
      players: normalizedPlayers,
    };

    setRoomState(nextRoom);
  }, [setRoomState]);

  const subscribeToRoom = useCallback(async (roomCode: string) => {
    cleanup();

    return await new Promise<ReturnType<typeof supabase.channel> | null>((resolve) => {
      let resolved = false;
      const resolveOnce = (value: ReturnType<typeof supabase.channel> | null) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const localPlayer = localPlayerRef.current;
      if (!localPlayer) {
        resolveOnce(null);
        return;
      }

      const channel = supabase.channel(`room:${roomCode}`, {
        config: { presence: { key: localPlayer.playerId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          applyPresenceSync(channel.presenceState() as Record<string, PresenceMeta[]>);
        })
        .on("broadcast", { event: "room_state" }, ({ payload }) => {
          const currentRoom = roomRef.current;
          if (!currentRoom) return;

          const nextRoom: GameRoom = {
            ...currentRoom,
            ...(payload as Partial<GameRoom>),
          };
          setRoomState(nextRoom);
        })
        .on("broadcast", { event: "game_start" }, ({ payload }) => {
          const currentRoom = roomRef.current;
          if (!currentRoom) return;

          const nextRoom: GameRoom = {
            ...currentRoom,
            ...(payload as Partial<GameRoom>),
            status: "countdown",
          };
          setRoomState(nextRoom);
        })
        .on("broadcast", { event: "game_active" }, ({ payload }) => {
          const currentRoom = roomRef.current;
          if (!currentRoom) return;

          const nextRoom: GameRoom = {
            ...currentRoom,
            ...(payload as Partial<GameRoom>),
            status: "active",
          };
          setRoomState(nextRoom);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            const currentRoom = roomRef.current;
            const currentPlayer = localPlayerRef.current;

            if (currentRoom && currentPlayer) {
              await channel.track(toPresencePayload(currentRoom, currentPlayer));
            }
            resolveOnce(channel);
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setError("Room connection failed");
            resolveOnce(null);
          }
        });

      channelRef.current = channel;
    });
  }, [applyPresenceSync, cleanup, setRoomState, toPresencePayload]);

  const createRoom = useCallback(async (hostName: string, mode: GameMode = "classic") => {
    const hostPlayer: RoomPlayer = {
      playerId: generateId(),
      displayName: hostName,
      isHost: true,
      isReady: true,
      joinedAt: nowIso(),
    };

    const newRoom: GameRoom = {
      roomCode: generateCode(),
      hostId: hostPlayer.playerId,
      mode,
      status: "waiting",
      players: [hostPlayer],
      loserId: null,
      loserName: null,
      countdownStartedAt: null,
      endedAt: null,
    };

    localPlayerRef.current = hostPlayer;
    setPlayerId(hostPlayer.playerId);
    setError(null);
    setRoomState(newRoom);

    const channel = await subscribeToRoom(newRoom.roomCode);
    if (!channel) return null;

    await channel.send({
      type: "broadcast",
      event: "room_state",
      payload: {
        hostId: newRoom.hostId,
        mode: newRoom.mode,
        status: newRoom.status,
      },
    });

    return { room: newRoom, playerId: hostPlayer.playerId };
  }, [setRoomState, subscribeToRoom]);

  const joinRoom = useCallback(async (code: string, displayName: string) => {
    const normalizedCode = normalizeRoomCode(code);
    const joinedPlayer: RoomPlayer = {
      playerId: generateId(),
      displayName,
      isHost: false,
      isReady: false,
      joinedAt: nowIso(),
    };

    const joinedRoom: GameRoom = {
      roomCode: normalizedCode,
      hostId: "",
      mode: "classic",
      status: "waiting",
      players: [joinedPlayer],
      loserId: null,
      loserName: null,
      countdownStartedAt: null,
      endedAt: null,
    };

    localPlayerRef.current = joinedPlayer;
    setPlayerId(joinedPlayer.playerId);
    setError(null);
    setRoomState(joinedRoom);

    const channel = await subscribeToRoom(normalizedCode);
    if (!channel) return null;

    return { playerId: joinedPlayer.playerId };
  }, [setRoomState, subscribeToRoom]);

  const toggleReady = useCallback(async () => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;
    if (!channel || !currentRoom || !localPlayer) return;

    const updatedPlayer: RoomPlayer = {
      ...localPlayer,
      isReady: !localPlayer.isReady,
    };
    localPlayerRef.current = updatedPlayer;

    const nextPlayers = currentRoom.players.some((player) => player.playerId === updatedPlayer.playerId)
      ? currentRoom.players.map((player) =>
          player.playerId === updatedPlayer.playerId ? updatedPlayer : player
        )
      : [...currentRoom.players, updatedPlayer];

    const nextRoom: GameRoom = {
      ...currentRoom,
      players: nextPlayers,
    };

    setRoomState(nextRoom);
    await channel.track(toPresencePayload(nextRoom, updatedPlayer));
  }, [setRoomState, toPresencePayload]);

  const updateMode = useCallback(async (mode: GameMode) => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;
    if (!channel || !currentRoom || !localPlayer || !localPlayer.isHost) return;

    const nextRoom: GameRoom = {
      ...currentRoom,
      mode,
    };
    setRoomState(nextRoom);

    await channel.track(toPresencePayload(nextRoom, localPlayer));
    await channel.send({
      type: "broadcast",
      event: "room_state",
      payload: { mode },
    });
  }, [setRoomState, toPresencePayload]);

  const startCountdown = useCallback(() => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;
    if (!channel || !currentRoom || !localPlayer || !localPlayer.isHost) return;

    const update: Pick<GameRoom, "status" | "countdownStartedAt"> = {
      status: "countdown",
      countdownStartedAt: nowIso(),
    };

    const nextRoom: GameRoom = {
      ...currentRoom,
      ...update,
    };

    setRoomState(nextRoom);
    channel.track(toPresencePayload(nextRoom, localPlayer));
    channel.send({
      type: "broadcast",
      event: "game_start",
      payload: update,
    });
  }, [setRoomState, toPresencePayload]);

  const startGame = useCallback(() => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;
    if (!channel || !currentRoom || !localPlayer || !localPlayer.isHost) return;

    const update: Pick<GameRoom, "status"> = {
      status: "active",
    };

    const nextRoom: GameRoom = {
      ...currentRoom,
      ...update,
    };

    setRoomState(nextRoom);
    channel.track(toPresencePayload(nextRoom, localPlayer));
    channel.send({
      type: "broadcast",
      event: "game_active",
      payload: update,
    });
  }, [setRoomState, toPresencePayload]);

  const reportLoss = useCallback((loserId: string, loserName: string) => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    if (!channel || !currentRoom) return;

    const update: Pick<GameRoom, "status" | "loserId" | "loserName" | "endedAt"> = {
      status: "finished",
      loserId,
      loserName,
      endedAt: nowIso(),
    };

    const nextRoom: GameRoom = {
      ...currentRoom,
      ...update,
    };

    setRoomState(nextRoom);
    channel.send({
      type: "broadcast",
      event: "room_state",
      payload: update,
    });
  }, [setRoomState]);

  const leaveRoom = useCallback(() => {
    cleanup();
    localPlayerRef.current = null;
    setRoomState(null);
    setPlayerId("");
    setError(null);
  }, [cleanup, setRoomState]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    room,
    players: room?.players ?? [],
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
