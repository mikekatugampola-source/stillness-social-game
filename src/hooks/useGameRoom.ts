import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameMode, GameRoom, GameStatus, RoomPlayer } from "@/lib/game-types";

type PresenceMeta = {
  playerId?: string;
  displayName?: string;
  isHost?: boolean;
  isReady?: boolean;
  motionEnabled?: boolean;
  joinedAt?: string;
  id?: string;
  name?: string;
  is_host?: boolean;
  is_ready?: boolean;
  motion_enabled?: boolean;
};

type RoomBroadcastEvent = "room_state" | "room_sync_request" | "motion_ready" | "game_start" | "game_active" | "game_finished";
type RoomChannel = ReturnType<typeof supabase.channel>;

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COUNTDOWN_SECONDS = 5;
const COUNTDOWN_SYNC_DELAY_MS = 1000;
const PHASE_ORDER: Record<GameStatus, number> = {
  lobby: 0,
  arming: 1,
  countdown: 2,
  playing: 3,
  finished: 4,
};

function normalizeStatus(status: unknown): GameStatus {
  if (status === "waiting") return "lobby";
  if (status === "active") return "playing";
  if (status === "arming" || status === "countdown" || status === "playing" || status === "finished") {
    return status;
  }
  return "lobby";
}

function resolveStatus(currentStatus: GameStatus | null, incomingStatus: unknown): GameStatus {
  const incoming = normalizeStatus(incomingStatus);
  if (!currentStatus) return incoming;
  return PHASE_ORDER[incoming] >= PHASE_ORDER[currentStatus] ? incoming : currentStatus;
}

function shouldUseIncomingFinish(currentRoom: GameRoom, incoming: Partial<GameRoom>): boolean {
  if (!incoming.loserId) return false;
  if (currentRoom.status !== "finished" || !currentRoom.loserId) return true;

  const currentEndedAt = currentRoom.endedAt ? new Date(currentRoom.endedAt).getTime() : Number.POSITIVE_INFINITY;
  const incomingEndedAt = incoming.endedAt ? new Date(incoming.endedAt).getTime() : Number.POSITIVE_INFINITY;

  if (incomingEndedAt !== currentEndedAt) return incomingEndedAt < currentEndedAt;
  return incoming.loserId.localeCompare(currentRoom.loserId) < 0;
}

/**
 * Deterministically derive the shared round start timestamp from the shared
 * countdown start timestamp. Every player has `countdownStartedAt` (broadcast
 * by the host as soon as the countdown begins), so every player can compute
 * the same `roundStartedAt` without waiting for a separate `game_active`
 * broadcast. This eliminates the race where a late `game_active` broadcast
 * leaves a player's timer stuck at 0:00.
 */
function deriveRoundStartedAt(countdownStartedAt: string | null): string | null {
  if (!countdownStartedAt) return null;
  const startedMs = new Date(countdownStartedAt).getTime();
  if (!Number.isFinite(startedMs)) return null;
  return new Date(startedMs + COUNTDOWN_SECONDS * 1000).toISOString();
}

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

function isoFromNow(delayMs: number): string {
  return new Date(Date.now() + delayMs).toISOString();
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
    motionEnabled: parseBool(meta.motionEnabled, parseBool(meta.motion_enabled)),
    joinedAt: meta.joinedAt ?? nowIso(),
  };
}

function buildPresencePayload(player: RoomPlayer): PresenceMeta {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    isHost: player.isHost,
    isReady: player.isReady,
    motionEnabled: player.motionEnabled,
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
  const status = normalizeStatus(nextRoom.status);

  const countdownStartedAt = nextRoom.countdownStartedAt ?? null;
  // Always prefer an explicit roundStartedAt, but fall back to a deterministic
  // derivation from the shared countdown timestamp so every client computes the
  // same value regardless of broadcast ordering.
  const roundStartedAt =
    nextRoom.roundStartedAt ?? deriveRoundStartedAt(countdownStartedAt);

  return {
    ...nextRoom,
    status,
    hostId,
    players: players.map((player) => ({
      ...player,
      isHost: hostId ? player.playerId === hostId : player.isHost,
      motionEnabled: player.motionEnabled ?? false,
    })),
    loserId: nextRoom.loserId ?? null,
    loserName: nextRoom.loserName ?? null,
    countdownStartedAt,
    roundStartedAt,
    endedAt: nextRoom.endedAt ?? null,
    dareText: nextRoom.dareText ?? null,
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
    status: "lobby",
    players,
    loserId: null,
    loserName: null,
    countdownStartedAt: null,
    roundStartedAt: null,
    endedAt: null,
    dareText: null,
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
  const status = resolveStatus(baseRoom.status, incoming.status);
  const useIncomingFinish = status === "finished" && shouldUseIncomingFinish(baseRoom, incoming);

  return normalizeRoom({
    ...baseRoom,
    ...incoming,
    status,
    players: incoming.players ?? baseRoom.players,
    loserId: useIncomingFinish ? incoming.loserId ?? null : baseRoom.loserId,
    loserName: useIncomingFinish ? incoming.loserName ?? null : baseRoom.loserName,
    endedAt: useIncomingFinish ? incoming.endedAt ?? null : baseRoom.endedAt,
  });
}

function allPlayersMotionEnabled(room: GameRoom): boolean {
  return room.players.length >= 2 && room.players.every((player) => player.motionEnabled);
}

/**
 * Apply a per-player motion-ready signal as a DELTA. We never let a player's
 * stale view of the room overwrite authoritative fields like `status`,
 * `countdownStartedAt`, or `roundStartedAt` — only the player's own
 * `motionEnabled` flag is updated.
 */
function applyMotionReadyDelta(
  currentRoom: GameRoom | null,
  signal: { playerId: string; motionEnabled: boolean }
): GameRoom | null {
  if (!currentRoom) return null;

  const hasPlayer = currentRoom.players.some((player) => player.playerId === signal.playerId);
  if (!hasPlayer) return currentRoom;

  return normalizeRoom({
    ...currentRoom,
    players: currentRoom.players.map((player) =>
      player.playerId === signal.playerId
        ? { ...player, motionEnabled: signal.motionEnabled || player.motionEnabled }
        : player
    ),
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

  const beginSharedCountdown = useCallback(
    async (channel: RoomChannel, nextRoom: GameRoom) => {
      if (nextRoom.status !== "arming" || !allPlayersMotionEnabled(nextRoom)) return false;

      const countdownRoom = normalizeRoom({
        ...nextRoom,
        status: "countdown",
        countdownStartedAt: isoFromNow(COUNTDOWN_SYNC_DELAY_MS),
      });

      console.log("[room:%s] all motion enabled, starting shared countdown", countdownRoom.roomCode);
      setRoomState(countdownRoom);
      await publishRoomState(channel, countdownRoom, "game_start");
      return true;
    },
    [publishRoomState, setRoomState]
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
        ]).map((player) => {
          const currentPlayer = currentRoom.players.find((item) => item.playerId === player.playerId);
          return {
            ...player,
            motionEnabled: Boolean(currentPlayer?.motionEnabled || player.motionEnabled),
          };
        }),
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
            const state = channel.presenceState() as Record<string, PresenceMeta[]>;
            console.log("[room:%s] presence sync, keys:", roomCode, Object.keys(state));
            const syncedRoom = applyPresenceSync(state);

            if (syncedRoom && localPlayerRef.current?.isHost) {
              console.log("[room:%s] host rebroadcasting room_state, players:", roomCode, syncedRoom.players.length);
              const countdownStarted = await beginSharedCountdown(channel, syncedRoom);
              if (!countdownStarted) {
                await publishRoomState(channel, syncedRoom);
              }
            }
          })
          .on("presence", { event: "join" }, ({ key, newPresences }) => {
            console.log("[room:%s] presence JOIN key=%s presences=%o", roomCode, key, newPresences);
          })
          .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
            console.log("[room:%s] presence LEAVE key=%s presences=%o", roomCode, key, leftPresences);
          })
          .on("broadcast", { event: "room_sync_request" }, async ({ payload }) => {
            console.log("[room:%s] received sync request from", roomCode, payload);
            if (!localPlayerRef.current?.isHost || !roomRef.current) return;
            const countdownStarted = await beginSharedCountdown(channel, roomRef.current);
            if (!countdownStarted) {
              await publishRoomState(channel, roomRef.current);
            }
          })
          .on("broadcast", { event: "room_state" }, ({ payload }) => {
            console.log("[room:%s] received room_state, players:", roomCode, (payload as GameRoom)?.players?.length);
            const mergedRoom = mergeRoom(roomRef.current, payload as Partial<GameRoom>);
            if (mergedRoom) {
              setRoomState(mergedRoom);
            }
          })
          .on("broadcast", { event: "motion_ready" }, async ({ payload }) => {
            const signal = payload as { playerId?: string; motionEnabled?: boolean } | null;
            console.log("[room:%s] received motion_ready delta:", roomCode, signal);
            if (!signal?.playerId) return;
            const mergedRoom = applyMotionReadyDelta(roomRef.current, {
              playerId: signal.playerId,
              motionEnabled: signal.motionEnabled !== false,
            });
            if (!mergedRoom) return;
            setRoomState(mergedRoom);

            if (localPlayerRef.current?.isHost) {
              const countdownStarted = await beginSharedCountdown(channel, mergedRoom);
              if (!countdownStarted) {
                // Re-broadcast authoritative full state so every client converges.
                await publishRoomState(channel, mergedRoom);
              }
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
              status: "playing",
            });

            if (mergedRoom) {
              setRoomState(mergedRoom);
            }
          })
          .on("broadcast", { event: "game_finished" }, ({ payload }) => {
            const mergedRoom = mergeRoom(roomRef.current, {
              ...(payload as Partial<GameRoom>),
              status: "finished",
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
    [applyPresenceSync, beginSharedCountdown, cleanup, publishRoomState, setRoomState]
  );

  const createRoom = useCallback(
    async (hostName: string, mode: GameMode = "classic") => {
      const hostPlayer: RoomPlayer = {
        playerId: generateId(),
        displayName: hostName,
        isHost: true,
        isReady: true,
        motionEnabled: false,
        joinedAt: nowIso(),
      };

      const nextRoom = createRoomState(generateCode(), hostPlayer.playerId, [hostPlayer], mode);

      localPlayerRef.current = hostPlayer;
      setPlayerId(hostPlayer.playerId);
      setError(null);
      setRoomState(nextRoom);

      // Subscribe to realtime in the background. Do NOT block room creation /
      // navigation on the realtime channel — if Supabase realtime is slow or
      // fails, the host should still enter the lobby with their room code.
      void subscribeToRoom(nextRoom.roomCode)
        .then(async (channel) => {
          if (channel) {
            try {
              await publishRoomState(channel, nextRoom);
            } catch (err) {
              console.warn("[room:%s] failed to publish initial state", nextRoom.roomCode, err);
            }
          } else {
            console.warn("[room:%s] realtime subscribe returned no channel", nextRoom.roomCode);
          }
        })
        .catch((err) => {
          console.warn("[room:%s] realtime subscribe error", nextRoom.roomCode, err);
        });

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
        motionEnabled: false,
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
    console.log("[room:%s] toggleReady ->", currentRoom.roomCode, updatedPlayer.isReady);
    await channel.track(buildPresencePayload(updatedPlayer));

    // If we are the host, broadcast authoritative state so others update.
    // If we are a player, request the host to rebroadcast (defense in depth
    // in case the host's presence sync is delayed).
    if (updatedPlayer.isHost) {
      await publishRoomState(channel, nextRoom);
    } else {
      await channel.send({
        type: "broadcast",
        event: "room_sync_request",
        payload: { playerId: updatedPlayer.playerId },
      });
    }
  }, [publishRoomState, setRoomState]);

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

  const updateDare = useCallback(
    async (dareText: string) => {
      const channel = channelRef.current;
      const currentRoom = roomRef.current;
      const localPlayer = localPlayerRef.current;

      if (!channel || !currentRoom || !localPlayer) return;
      if (!(localPlayer.isHost || currentRoom.hostId === localPlayer.playerId)) return;

      const nextRoom = normalizeRoom({
        ...currentRoom,
        dareText,
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
      currentRoom.players.length >= 2 &&
      currentRoom.players.every((player) => player.isReady) &&
      (currentRoom.mode !== "dare" || !!currentRoom.dareText?.trim());

    if (!canStart) return;

    const nextRoom = normalizeRoom({
      ...currentRoom,
      status: "arming",
      players: currentRoom.players.map((player) => ({
        ...player,
        motionEnabled: false,
      })),
      countdownStartedAt: null,
      roundStartedAt: null,
      loserId: null,
      loserName: null,
      endedAt: null,
    });

    setRoomState(nextRoom);
    await publishRoomState(channel, nextRoom);
  }, [publishRoomState, setRoomState]);

  const markMotionEnabled = useCallback(async () => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;

    if (!channel || !currentRoom || !localPlayer) return;

    const updatedPlayer: RoomPlayer = {
      ...localPlayer,
      motionEnabled: true,
    };

    localPlayerRef.current = updatedPlayer;

    const nextRoom = normalizeRoom({
      ...currentRoom,
      status: currentRoom.status === "lobby" ? "arming" : currentRoom.status,
      players: dedupePlayers([
        ...currentRoom.players.filter((player) => player.playerId !== updatedPlayer.playerId),
        updatedPlayer,
      ]),
    });

    console.log("[room:%s] motion enabled by %s", nextRoom.roomCode, updatedPlayer.playerId);
    setRoomState(nextRoom);
    await channel.track(buildPresencePayload(updatedPlayer));

    // Always send motion_ready as a small DELTA so we never overwrite the
    // host's authoritative status / countdownStartedAt / roundStartedAt with
    // a stale snapshot from this client.
    const motionReadyDelta = {
      playerId: updatedPlayer.playerId,
      motionEnabled: true,
    };

    if (updatedPlayer.isHost) {
      const countdownStarted = await beginSharedCountdown(channel, nextRoom);
      if (!countdownStarted) {
        await channel.send({ type: "broadcast", event: "motion_ready", payload: motionReadyDelta });
      }
    } else {
      await channel.send({ type: "broadcast", event: "motion_ready", payload: motionReadyDelta });
      await channel.send({
        type: "broadcast",
        event: "room_sync_request",
        payload: { playerId: updatedPlayer.playerId },
      });
    }
  }, [beginSharedCountdown, publishRoomState, setRoomState]);

  const startGame = useCallback(async () => {
    const channel = channelRef.current;
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;

    if (!channel || !currentRoom || !localPlayer) return;
    if (!(localPlayer.isHost || currentRoom.hostId === localPlayer.playerId)) return;

    const countdownStartedMs = currentRoom.countdownStartedAt
      ? new Date(currentRoom.countdownStartedAt).getTime()
      : null;
    const sharedRoundStartedAt = countdownStartedMs && Number.isFinite(countdownStartedMs)
      ? new Date(countdownStartedMs + COUNTDOWN_SECONDS * 1000).toISOString()
      : nowIso();

    const nextRoom = normalizeRoom({
      ...currentRoom,
      status: "playing",
      roundStartedAt: currentRoom.roundStartedAt ?? sharedRoundStartedAt,
    });

    setRoomState(nextRoom);
    await publishRoomState(channel, nextRoom, "game_active");
  }, [publishRoomState, setRoomState]);

  const reportLoss = useCallback(
    async (loserId: string, loserName: string) => {
      const channel = channelRef.current;
      const currentRoom = roomRef.current;

      if (!channel || !currentRoom) return;
      if (currentRoom.status === "finished") return;

      const nextRoom = normalizeRoom({
        ...currentRoom,
        status: "finished",
        loserId,
        loserName,
        endedAt: nowIso(),
      });

      setRoomState(nextRoom);
      await publishRoomState(channel, nextRoom, "game_finished");
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

  // Refetch room state on app foreground by re-requesting sync from host
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const channel = channelRef.current;
      const localPlayer = localPlayerRef.current;
      if (!channel || !localPlayer) return;

      console.log("[room] app foregrounded, re-tracking & requesting sync");
      try {
        await channel.track(buildPresencePayload(localPlayer));
        if (!localPlayer.isHost) {
          await channel.send({
            type: "broadcast",
            event: "room_sync_request",
            payload: { playerId: localPlayer.playerId },
          });
        } else if (roomRef.current) {
          await publishRoomState(channel, roomRef.current);
        }
      } catch (err) {
        console.warn("[room] visibility resync failed", err);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [publishRoomState]);


  return {
    room,
    players: room?.players ?? [],
    playerId,
    error,
    createRoom,
    joinRoom,
    toggleReady,
    updateMode,
    updateDare,
    startCountdown,
    markMotionEnabled,
    startGame,
    reportLoss,
    leaveRoom,
  };
}
