export type GameMode = "classic" | "punishment" | "drinks";

export type GameStatus = "waiting" | "countdown" | "active" | "finished";

export interface RoomPlayer {
  playerId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  joinedAt: string;
}

export interface GameRoom {
  roomCode: string;
  hostId: string;
  mode: GameMode;
  status: GameStatus;
  players: RoomPlayer[];
  loserId: string | null;
  loserName: string | null;
  countdownStartedAt: string | null;
  endedAt: string | null;
  punishmentText: string | null;
}

export type Player = RoomPlayer;
