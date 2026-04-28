CREATE OR REPLACE FUNCTION public.join_game_room(p_room_code text, p_player_id text, p_display_name text)
 RETURNS game_rooms
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room public.game_rooms;
  v_player_exists BOOLEAN;
BEGIN
  SELECT * INTO v_room
  FROM public.game_rooms
  WHERE room_code = upper(btrim(p_room_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_room.players) AS player
    WHERE player->>'playerId' = p_player_id
  ) INTO v_player_exists;

  IF v_player_exists THEN
    RETURN v_room;
  END IF;

  IF v_room.status NOT IN ('lobby', 'arming') THEN
    RAISE EXCEPTION 'GAME_ALREADY_STARTED';
  END IF;

  UPDATE public.game_rooms
  SET players = v_room.players || jsonb_build_array(jsonb_build_object(
    'playerId', p_player_id,
    'displayName', p_display_name,
    'isHost', false,
    'isReady', false,
    'motionEnabled', false,
    'joinedAt', now()::text
  ))
  WHERE room_code = v_room.room_code
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$function$;