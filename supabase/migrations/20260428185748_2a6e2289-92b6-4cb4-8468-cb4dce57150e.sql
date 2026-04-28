CREATE TABLE public.game_rooms (
  room_code TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'classic',
  status TEXT NOT NULL DEFAULT 'lobby',
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  loser_id TEXT,
  loser_name TEXT,
  countdown_started_at TIMESTAMPTZ,
  round_started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  dare_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room code holders can view game rooms"
ON public.game_rooms
FOR SELECT
USING (true);

CREATE POLICY "Players can create game rooms"
ON public.game_rooms
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Room code holders can update game rooms"
ON public.game_rooms
FOR UPDATE
USING (true)
WITH CHECK (true);

ALTER TABLE public.game_rooms REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;

CREATE OR REPLACE FUNCTION public.update_game_rooms_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_game_rooms_updated_at
BEFORE UPDATE ON public.game_rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_game_rooms_updated_at();