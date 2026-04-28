ALTER FUNCTION public.create_game_room(TEXT, TEXT, TEXT, TEXT) SECURITY INVOKER;
ALTER FUNCTION public.join_game_room(TEXT, TEXT, TEXT) SECURITY INVOKER;
ALTER FUNCTION public.set_game_room_player_ready(TEXT, TEXT, BOOLEAN) SECURITY INVOKER;
ALTER FUNCTION public.update_game_room_mode(TEXT, TEXT, TEXT) SECURITY INVOKER;
ALTER FUNCTION public.update_game_room_dare(TEXT, TEXT, TEXT) SECURITY INVOKER;
ALTER FUNCTION public.start_game_arming(TEXT, TEXT) SECURITY INVOKER;
ALTER FUNCTION public.mark_game_room_motion_enabled(TEXT, TEXT) SECURITY INVOKER;
ALTER FUNCTION public.activate_game_if_ready(TEXT) SECURITY INVOKER;
ALTER FUNCTION public.finish_game_room(TEXT, TEXT, TEXT) SECURITY INVOKER;

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

GRANT SELECT, INSERT, UPDATE ON public.game_rooms TO anon, authenticated;