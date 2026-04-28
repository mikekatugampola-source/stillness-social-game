export type GameMode = "classic" | "dare";

export type GameStatus = "waiting" | "arming" | "countdown" | "active" | "finished";

export interface RoomPlayer {
  playerId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  motionEnabled: boolean;
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
  roundStartedAt: string | null;
  endedAt: string | null;
  dareText: string | null;
}

export type Player = RoomPlayer;
