DROP POLICY IF EXISTS "Players can create game rooms" ON public.game_rooms;
DROP POLICY IF EXISTS "Room code holders can update game rooms" ON public.game_rooms;

CREATE POLICY "Players can create valid game rooms"
ON public.game_rooms
FOR INSERT
WITH CHECK (
  room_code ~ '^[A-Z2-9]{4}$'
  AND mode IN ('classic', 'dare')
  AND status IN ('lobby', 'arming', 'countdown', 'playing', 'finished')
  AND jsonb_typeof(players) = 'array'
);

CREATE POLICY "Players can update valid game rooms"
ON public.game_rooms
FOR UPDATE
USING (room_code ~ '^[A-Z2-9]{4}$')
WITH CHECK (
  room_code ~ '^[A-Z2-9]{4}$'
  AND mode IN ('classic', 'dare')
  AND status IN ('lobby', 'arming', 'countdown', 'playing', 'finished')
  AND jsonb_typeof(players) = 'array'
);