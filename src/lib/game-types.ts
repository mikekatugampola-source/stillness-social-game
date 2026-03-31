export type GameMode = "classic" | "punishment" | "drinks";

export interface Player {
  id: string;
  name: string;
  is_ready: boolean;
  is_host: boolean;
}

export interface GameRoom {
  id: string;
  code: string;
  status: "waiting" | "countdown" | "playing" | "finished";
  mode: GameMode;
  host_id: string;
  loser_id: string | null;
  loser_name: string | null;
  started_at: string | null;
  ended_at: string | null;
}
