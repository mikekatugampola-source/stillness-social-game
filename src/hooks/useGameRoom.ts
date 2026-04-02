import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameMode, GameRoom, RoomPlayer } from "@/lib/game-types";

type PresenceMeta = {
  playerId?: string;
  displayName?: string;
  isHost?: boolean;
  isReady?: boolean;
  joinedAt?: string;
  id?: string;
  name?: string;
  is_host?: boolean;
  is_ready?: boolean;
};

type RoomBroadcastEvent = "room_state" | "room_sync_request" | "game_start" | "game_active";
type RoomChannel = ReturnType<typeof supabase.channel>;

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
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
  return typeof value === "boolean" ? value : fallback;
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

function buildPresencePayload(player: RoomPlayer): PresenceMeta {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    isHost: player.isHost,
    isReady: player.isReady,
    joinedAt: player.joinedAt,
  };
}

function sortPlayers(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((first, second) => first.joinedAt.localeCompare(second.joinedAt));
}

function dedupePlayers(players: RoomPlayer[]): RoomPlayer[] {
  const playersById = new Map<string, RoomPlayer>();

  players.forEach((player) => {
    playersById.set(player.playerId, player);
  });

  return sortPlayers(Array.from(playersById.values()));
}

function normalizeRoom(nextRoom: GameRoom): GameRoom {
  const players = dedupePlayers(nextRoom.players);
  const hostId = nextRoom.hostId || players.find((player) => player.isHost)?.playerId || "";

  return {
    ...nextRoom,
    hostId,
    players: players.map((player) => ({
      ...player,
      isHost: hostId ? player.playerId === hostId : player.isHost,
    })),
    loserId: nextRoom.loserId ?? null,
    loserName: nextRoom.loserName ?? null,
    countdownStartedAt: nextRoom.countdownStartedAt ?? null,
    endedAt: nextRoom.endedAt ?? null,
  };
}

function createRoomState(
  roomCode: string,
  hostId: string,
  players: RoomPlayer[],
  mode: GameMode = "classic"
): GameRoom {
  return normalizeRoom({
    roomCode,
    hostId,
    mode,
    status: "waiting",
    players,
    loserId: null,
    loserName: null,
    countdownStartedAt: null,
    endedAt: null,
  });
}

function mergeRoom(
  currentRoom: GameRoom | null,
  incoming: Partial<GameRoom> & { roomCode?: string }
): GameRoom | null {
  if (!currentRoom && !incoming.roomCode) return null;

  const baseRoom =
    currentRoom ??
    createRoomState(
      incoming.roomCode ?? "",
      incoming.hostId ?? "",
      incoming.players ?? [],
      incoming.mode ?? "classic"
    );

  return normalizeRoom({
    ...baseRoom,
    ...incoming,
    players: incoming.players ?? baseRoom.players,
  });
}

export function useGameRoom() {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RoomChannel | null>(null);
  const roomRef = useRef<GameRoom | null>(null);
  const localPlayerRef = useRef<RoomPlayer | null>(null);

  const syncLocalPlayerFromRoom = useCallback((nextRoom: GameRoom | null) => {
    const currentLocalPlayer = localPlayerRef.current;
    if (!nextRoom || !currentLocalPlayer) return;

    const syncedPlayer = nextRoom.players.find((player) => player.playerId === currentLocalPlayer.playerId);
    if (syncedPlayer) {
      localPlayerRef.current = syncedPlayer;
    }
  }, []);

  const setRoomState = useCallback(
    (nextRoom: GameRoom | null) => {
      const normalizedRoom = nextRoom ? normalizeRoom(nextRoom) : null;
      roomRef.current = normalizedRoom;
      setRoom(normalizedRoom);
      syncLocalPlayerFromRoom(normalizedRoom);
    },
    [syncLocalPlayerFromRoom]
  );

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const publishRoomState = useCallback(
    async (channel: RoomChannel, nextRoom: GameRoom, event: RoomBroadcastEvent = "room_state") => {
      await channel.send({
        type: "broadcast",
        event,
        payload: normalizeRoom(nextRoom),
      });
    },
    []
  );

  const applyPresenceSync = useCallback(
    (presenceState: Record<string, PresenceMeta[]>) => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return null;

      const parsedPlayers = Object.values(presenceState)
        .flatMap((entries) => entries)
        .map(parsePresencePlayer)
        .filter((player): player is RoomPlayer => Boolean(player));

      const localPlayer = localPlayerRef.current;
      const nextRoom = normalizeRoom({
        ...currentRoom,
        players: dedupePlayers([
          ...(localPlayer ? [localPlayer] : []),
          ...parsedPlayers,
        ]),
      });

      setRoomState(nextRoom);
      return nextRoom;
    },
    [setRoomState]
  );

  const subscribeToRoom = useCallback(
    async (roomCode: string) => {
      cleanup();

      return await new Promise<RoomChannel | null>((resolve) => {
        let resolved = false;

        const resolveOnce = (value: RoomChannel | null) => {
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
          config: {
            presence: { key: localPlayer.playerId },
          },
        });

        channel
          .on("presence", { event: "sync" }, async () => {
            const syncedRoom = applyPresenceSync(
              channel.presenceState() as Record<string, PresenceMeta[]>
            );

            if (syncedRoom && localPlayerRef.current?.isHost) {
              await publishRoomState(channel, syncedRoom);
            }
          })
          .on("broadcast", { event: "room_sync_request" }, async () => {
            if (!localPlayerRef.current?.isHost || !roomRef.current) return;
            await publishRoomState(channel, roomRef.current);
          })
          .on("broadcast", { event: "room_state" }, ({ payload }) => {
            const mergedRoom = mergeRoom(roomRef.current, payload as Partial<GameRoom>);
            if (mergedRoom) {
              setRoomState(mergedRoom);
            }
          })
          .on("broadcast", { event: "game_start" }, ({ payload }) => {
            const mergedRoom = mergeRoom(roomRef.current, {
              ...(payload as Partial<GameRoom>),
              status: "countdown",
            });

            if (mergedRoom) {
              setRoomState(mergedRoom);
            }
          })
          .on("broadcast", { event: "game_active" }, ({ payload }) => {
            const mergedRoom = mergeRoom(roomRef.current, {
              ...(payload as Partial<GameRoom>),
              status: "active",
            });

            if (mergedRoom) {
              setRoomState(mergedRoom);
            }
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              const currentPlayer = localPlayerRef.current;
              if (currentPlayer) {
                await channel.track(buildPresencePayload(currentPlayer));
              }

              const syncedRoom = applyPresenceSync(
                channel.presenceState() as Record<string, PresenceMeta[]>
              );

              if (currentPlayer?.isHost && syncedRoom) {
                await publishRoomState(channel, syncedRoom);
              }

              if (currentPlayer && !currentPlayer.isHost) {
                await channel.send({
                  type: "broadcast",
                  event: "room_sync_request",
                  payload: { playerId: currentPlayer.playerId },
                });
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
    },
    [applyPresenceSync, cleanup, publishRoomState, setRoomState]
  );

  const createRoom = useCallback(
    async (hostName: string, mode: GameMode = "classic") => {
      const hostPlayer: RoomPlayer = {
        playerId: generateId(),
        displayName: hostName,
        isHost: true,
        isReady: true,
        joinedAt: nowIso(),
      };

      const nextRoom = createRoomState(generateCode(), hostPlayer.playerId, [hostPlayer], mode);

      localPlayerRef.current = hostPlayer;
      setPlayerId(hostPlayer.playerId);
      setError(null);
      setRoomState(nextRoom);

      const channel = await subscribeToRoom(nextRoom.roomCode);
      if (!channel) return null;

      await publishRoomState(channel, nextRoom);

      return {
        room: roomRef.current ?? nextRoom,
        playerId: hostPlayer.playerId,
      };
    },
    [publishRoomState, setRoomState, subscribeToRoom]
  );

  const joinRoom = useCallback(
    async (code: string, displayName: string) => {
      const joinedPlayer: RoomPlayer = {
        playerId: generateId(),
        displayName,
        isHost: false,
        isReady: false,
        joinedAt: nowIso(),
      };

      const normalizedCode = normalizeRoomCode(code);
      const nextRoom = createRoomState(normalizedCode, "", [joinedPlayer]);

      localPlayerRef.current = joinedPlayer;
      setPlayerId(joinedPlayer.playerId);
      setError(null);
      setRoomState(nextRoom);

      const channel = await subscribeToRoom(normalizedCode);
      if (!channel) return null;

      return {
        room: roomRef.current ?? nextRoom,
        playerId: joinedPlayer.playerId,
      };
    },
    [setRoomState, subscribeToRoom]
  );

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

    const nextRoom = normalizeRoom({
      ...currentRoom,
      players: dedupePlayers([
        ...currentRoom.players.filter((player) => player.playerId !== updatedPlayer.playerId),
        updatedPlayer,
      ]),
    });

    setRoomState(nextRoom);
    await channel.track(buildPresencePayload(updatedPlayer));
  }, [setRoomState]);

  const updateMode = useCallback(
    async (mode: GameMode) => {
      const channel = channelRef.current;
      const currentRoom = roomRef.current;
      const localPlayer = localPlayerRef.current;

      if (!channel || !currentRoom || !localPlayer) return;
      if (!(localPlayer.isHost || currentRoom.hostId === localPlayer.playerId)) return;

      const nextRoom = normalizeRoom({
        ...currentRoom,
        mode,
      });

      setRoomState(nextRoom);
      await publishRoomState(channel, nextRoom);
    },
    [publishRoomState, setRoomState]
  );

  const startCountdown = useCallback(async () => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;

    if (!channel || !currentRoom || !localPlayer) return;
    if (!(localPlayer.isHost || currentRoom.hostId === localPlayer.playerId)) return;

    const canStart =
      currentRoom.players.length >= 2 && currentRoom.players.every((player) => player.isReady);

    if (!canStart) return;

    const nextRoom = normalizeRoom({
      ...currentRoom,
      status: "countdown",
      countdownStartedAt: nowIso(),
    });

    setRoomState(nextRoom);
    await publishRoomState(channel, nextRoom, "game_start");
  }, [publishRoomState, setRoomState]);

  const startGame = useCallback(async () => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;

    if (!channel || !currentRoom || !localPlayer) return;
    if (!(localPlayer.isHost || currentRoom.hostId === localPlayer.playerId)) return;

    const nextRoom = normalizeRoom({
      ...currentRoom,
      status: "active",
    });

    setRoomState(nextRoom);
    await publishRoomState(channel, nextRoom, "game_active");
  }, [publishRoomState, setRoomState]);

  const reportLoss = useCallback(
    async (loserId: string, loserName: string) => {
      const channel = channelRef.current;
      const currentRoom = roomRef.current;

      if (!channel || !currentRoom) return;

      const nextRoom = normalizeRoom({
        ...currentRoom,
        status: "finished",
        loserId,
        loserName,
        endedAt: nowIso(),
      });

      setRoomState(nextRoom);
      await publishRoomState(channel, nextRoom);
    },
    [publishRoomState, setRoomState]
  );

  const leaveRoom = useCallback(() => {
    cleanup();
    localPlayerRef.current = null;
    roomRef.current = null;
    setRoom(null);
    setPlayerId("");
    setError(null);
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

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
