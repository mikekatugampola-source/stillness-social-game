import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GameMode, GameRoom, GameStatus, RoomPlayer } from "@/lib/game-types";

type RoomChannel = ReturnType<typeof supabase.channel>;

type GameRoomRow = {
  room_code: string;
  host_id: string;
  mode: string;
  status: string;
  players: unknown;
  loser_id: string | null;
  loser_name: string | null;
  countdown_started_at: string | null;
  round_started_at: string | null;
  ended_at: string | null;
  dare_text: string | null;
};

const db = supabase as any;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COUNTDOWN_SECONDS = 5;
const SUPABASE_URL_DEBUG = (import.meta as any).env?.VITE_SUPABASE_URL ?? "(unknown)";
// eslint-disable-next-line no-console
console.info("[room] backend env", SUPABASE_URL_DEBUG);
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

function normalizeMode(mode: unknown): GameMode {
  return mode === "dare" ? "dare" : "classic";
}

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

function normalizeRoomCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

function sortPlayers(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((first, second) => first.joinedAt.localeCompare(second.joinedAt));
}

function dedupePlayers(players: RoomPlayer[]): RoomPlayer[] {
  const playersById = new Map<string, RoomPlayer>();
  players.forEach((player) => playersById.set(player.playerId, player));
  return sortPlayers(Array.from(playersById.values()));
}

function parsePlayers(value: unknown): RoomPlayer[] {
  if (!Array.isArray(value)) return [];

  return dedupePlayers(
    value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const raw = item as Record<string, unknown>;
        const playerId = typeof raw.playerId === "string" ? raw.playerId : "";
        if (!playerId) return null;

        return {
          playerId,
          displayName: typeof raw.displayName === "string" ? raw.displayName : "Player",
          isHost: raw.isHost === true,
          isReady: raw.isReady === true,
          motionEnabled: raw.motionEnabled === true,
          joinedAt: typeof raw.joinedAt === "string" ? raw.joinedAt : nowIso(),
        } satisfies RoomPlayer;
      })
      .filter((player): player is RoomPlayer => Boolean(player))
  );
}

function normalizeRoom(nextRoom: GameRoom): GameRoom {
  const players = dedupePlayers(nextRoom.players);
  const hostId = nextRoom.hostId || players.find((player) => player.isHost)?.playerId || "";
  const status = normalizeStatus(nextRoom.status);
  const countdownStartedAt = nextRoom.countdownStartedAt ?? null;
  const roundStartedAt = nextRoom.roundStartedAt ?? deriveRoundStartedAt(countdownStartedAt);

  return {
    ...nextRoom,
    mode: normalizeMode(nextRoom.mode),
    status,
    hostId,
    players: players.map((player) => ({
      ...player,
      isHost: hostId ? player.playerId === hostId : player.isHost,
      motionEnabled: Boolean(player.motionEnabled),
    })),
    loserId: nextRoom.loserId ?? null,
    loserName: nextRoom.loserName ?? null,
    countdownStartedAt,
    roundStartedAt,
    endedAt: nextRoom.endedAt ?? null,
    dareText: nextRoom.dareText ?? null,
  };
}

function roomFromRow(row: GameRoomRow): GameRoom {
  return normalizeRoom({
    roomCode: row.room_code,
    hostId: row.host_id,
    mode: normalizeMode(row.mode),
    status: normalizeStatus(row.status),
    players: parsePlayers(row.players),
    loserId: row.loser_id,
    loserName: row.loser_name,
    countdownStartedAt: row.countdown_started_at,
    roundStartedAt: row.round_started_at,
    endedAt: row.ended_at,
    dareText: row.dare_text,
  });
}

function shouldAcceptIncomingRoom(currentRoom: GameRoom | null, incomingRoom: GameRoom): boolean {
  if (!currentRoom) return true;
  if (currentRoom.roomCode !== incomingRoom.roomCode) return false;
  if (incomingRoom.status === "finished") return true;
  if (currentRoom.status === "finished") return false;
  return PHASE_ORDER[incomingRoom.status] >= PHASE_ORDER[currentRoom.status];
}

export function useGameRoom() {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RoomChannel | null>(null);
  const roomRef = useRef<GameRoom | null>(null);
  const localPlayerRef = useRef<RoomPlayer | null>(null);
  const serverOffsetMsRef = useRef(0);

  const getSyncedNow = useCallback(() => Date.now() + serverOffsetMsRef.current, []);

  const syncServerClock = useCallback(async () => {
    try {
      const before = Date.now();
      const { data, error: rpcError } = await db.rpc("game_server_now");
      const after = Date.now();
      if (rpcError || !data) return;

      const serverMs = new Date(data as string).getTime();
      if (!Number.isFinite(serverMs)) return;
      serverOffsetMsRef.current = serverMs - (before + after) / 2;
    } catch (err) {
      console.warn("[room] server clock sync failed", err);
    }
  }, []);

  const syncLocalPlayerFromRoom = useCallback((nextRoom: GameRoom | null) => {
    const currentLocalPlayer = localPlayerRef.current;
    if (!nextRoom || !currentLocalPlayer) return;

    const syncedPlayer = nextRoom.players.find((player) => player.playerId === currentLocalPlayer.playerId);
    if (syncedPlayer) localPlayerRef.current = syncedPlayer;
  }, []);

  const setRoomState = useCallback(
    (nextRoom: GameRoom | null) => {
      const normalizedRoom = nextRoom ? normalizeRoom(nextRoom) : null;
      if (normalizedRoom && !shouldAcceptIncomingRoom(roomRef.current, normalizedRoom)) return;

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

  const applyRoomRow = useCallback(
    (row: GameRoomRow | null | undefined) => {
      if (!row) return null;
      const nextRoom = roomFromRow(row);
      setRoomState(nextRoom);
      return nextRoom;
    },
    [setRoomState]
  );

  const fetchRoomState = useCallback(
    async (roomCode: string) => {
      const { data, error: fetchError } = await db
        .from("game_rooms")
        .select("*")
        .eq("room_code", normalizeRoomCode(roomCode))
        .maybeSingle();

      if (fetchError) {
        console.warn("[room:%s] fetch failed", roomCode, fetchError);
        return null;
      }

      return applyRoomRow(data as GameRoomRow | null);
    },
    [applyRoomRow]
  );

  const callRoomAction = useCallback(
    async (functionName: string, args: Record<string, unknown>) => {
      const { data, error: rpcError } = await db.rpc(functionName, args);
      if (rpcError) {
        console.warn("[room] action failed", functionName, rpcError);
        setError(rpcError.message ?? "Room action failed");
        return null;
      }

      void syncServerClock();
      return applyRoomRow(data as GameRoomRow | null);
    },
    [applyRoomRow, syncServerClock]
  );

  const subscribeToRoom = useCallback(
    async (roomCode: string) => {
      cleanup();
      const normalizedCode = normalizeRoomCode(roomCode);

      const channel = supabase
        .channel(`game-room:${normalizedCode}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "game_rooms",
            filter: `room_code=eq.${normalizedCode}`,
          },
          (payload) => {
            const nextRow = (payload.new || payload.old) as GameRoomRow | null;
            applyRoomRow(nextRow);
            void syncServerClock();
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setError("Room connection failed");
          }
        });

      channelRef.current = channel;
      await fetchRoomState(normalizedCode);
      void syncServerClock();
      return channel;
    },
    [applyRoomRow, cleanup, fetchRoomState, syncServerClock]
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

      localPlayerRef.current = hostPlayer;
      setPlayerId(hostPlayer.playerId);
      setError(null);
      await syncServerClock();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const roomCode = generateCode();
        const createdRoom = await callRoomAction("create_game_room", {
          p_room_code: roomCode,
          p_host_id: hostPlayer.playerId,
          p_host_name: hostPlayer.displayName,
          p_mode: mode,
        });

        if (createdRoom) {
          void subscribeToRoom(createdRoom.roomCode);
          return { room: createdRoom, playerId: hostPlayer.playerId };
        }
      }

      return null;
    },
    [callRoomAction, subscribeToRoom, syncServerClock]
  );

  const joinRoom = useCallback(
    async (code: string, displayName: string) => {
      const normalizedCode = normalizeRoomCode(code);
      if (!/^[A-Z2-9]{4}$/.test(normalizedCode)) {
        setError("Room not found");
        return { ok: false as const, errorCode: "ROOM_NOT_FOUND" as const, message: "Room not found" };
      }

      const joinedPlayer: RoomPlayer = {
        playerId: generateId(),
        displayName,
        isHost: false,
        isReady: false,
        motionEnabled: false,
        joinedAt: nowIso(),
      };

      setError(null);
      await syncServerClock();

      const { data, error: rpcError } = await db.rpc("join_game_room", {
        p_room_code: normalizedCode,
        p_player_id: joinedPlayer.playerId,
        p_display_name: joinedPlayer.displayName,
      });

      if (rpcError) {
        const raw = `${rpcError.message ?? ""}`;
        let errorCode: "ROOM_NOT_FOUND" | "GAME_ALREADY_STARTED" | "NETWORK" = "NETWORK";
        let message = "Couldn't join. Try again.";
        if (raw.includes("ROOM_NOT_FOUND")) {
          errorCode = "ROOM_NOT_FOUND";
          message = "Room not found";
        } else if (raw.includes("GAME_ALREADY_STARTED")) {
          errorCode = "GAME_ALREADY_STARTED";
          message = "Game already started";
        }
        console.warn("[room] join failed", rpcError);
        setError(message);
        return { ok: false as const, errorCode, message };
      }

      const joinedRoom = applyRoomRow(data as GameRoomRow | null);
      if (!joinedRoom) {
        setError("Couldn't join. Try again.");
        return { ok: false as const, errorCode: "NETWORK" as const, message: "Couldn't join. Try again." };
      }

      localPlayerRef.current = joinedPlayer;
      setPlayerId(joinedPlayer.playerId);
      void subscribeToRoom(joinedRoom.roomCode);
      return { ok: true as const, room: joinedRoom, playerId: joinedPlayer.playerId };
    },
    [applyRoomRow, subscribeToRoom, syncServerClock]
  );

  const toggleReady = useCallback(async () => {
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;
    if (!currentRoom || !localPlayer || currentRoom.status !== "lobby") return;

    await callRoomAction("set_game_room_player_ready", {
      p_room_code: currentRoom.roomCode,
      p_player_id: localPlayer.playerId,
      p_is_ready: !localPlayer.isReady,
    });
  }, [callRoomAction]);

  const updateMode = useCallback(
    async (mode: GameMode) => {
      const currentRoom = roomRef.current;
      const localPlayer = localPlayerRef.current;
      if (!currentRoom || !localPlayer) return;
      if (!(localPlayer.isHost || currentRoom.hostId === localPlayer.playerId)) return;

      await callRoomAction("update_game_room_mode", {
        p_room_code: currentRoom.roomCode,
        p_player_id: localPlayer.playerId,
        p_mode: mode,
      });
    },
    [callRoomAction]
  );

  const updateDare = useCallback(
    async (dareText: string) => {
      const currentRoom = roomRef.current;
      const localPlayer = localPlayerRef.current;
      if (!currentRoom || !localPlayer) return;
      if (!(localPlayer.isHost || currentRoom.hostId === localPlayer.playerId)) return;

      await callRoomAction("update_game_room_dare", {
        p_room_code: currentRoom.roomCode,
        p_player_id: localPlayer.playerId,
        p_dare_text: dareText,
      });
    },
    [callRoomAction]
  );

  const startCountdown = useCallback(async () => {
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;
    if (!currentRoom || !localPlayer) return;
    if (!(localPlayer.isHost || currentRoom.hostId === localPlayer.playerId)) return;

    await callRoomAction("start_game_arming", {
      p_room_code: currentRoom.roomCode,
      p_player_id: localPlayer.playerId,
    });
  }, [callRoomAction]);

  const markMotionEnabled = useCallback(async () => {
    const currentRoom = roomRef.current;
    const localPlayer = localPlayerRef.current;
    if (!currentRoom || !localPlayer || currentRoom.status !== "arming") return;

    await callRoomAction("mark_game_room_motion_enabled", {
      p_room_code: currentRoom.roomCode,
      p_player_id: localPlayer.playerId,
    });
  }, [callRoomAction]);

  const startGame = useCallback(async () => {
    const currentRoom = roomRef.current;
    if (!currentRoom || currentRoom.status !== "countdown") return;

    await callRoomAction("activate_game_if_ready", {
      p_room_code: currentRoom.roomCode,
    });
  }, [callRoomAction]);

  const reportLoss = useCallback(
    async (loserId: string, loserName: string) => {
      const currentRoom = roomRef.current;
      if (!currentRoom || currentRoom.status !== "playing") return;

      await callRoomAction("finish_game_room", {
        p_room_code: currentRoom.roomCode,
        p_loser_id: loserId,
        p_loser_name: loserName,
      });
    },
    [callRoomAction]
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      void syncServerClock();
      void fetchRoomState(currentRoom.roomCode);
    }, 1500);

    return () => window.clearInterval(interval);
  }, [fetchRoomState, syncServerClock]);

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      await syncServerClock();
      await fetchRoomState(currentRoom.roomCode);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchRoomState, syncServerClock]);

  return {
    room,
    players: room?.players ?? [],
    playerId,
    error,
    getSyncedNow,
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
