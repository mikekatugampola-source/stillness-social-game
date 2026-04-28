CREATE OR REPLACE FUNCTION public.create_game_room(
  p_room_code TEXT,
  p_host_id TEXT,
  p_host_name TEXT,
  p_mode TEXT DEFAULT 'classic'
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room public.game_rooms;
  v_room_code TEXT := regexp_replace(upper(coalesce(p_room_code, '')), '\s+', '', 'g');
  v_mode TEXT := CASE WHEN p_mode IN ('classic', 'dare') THEN p_mode ELSE 'classic' END;
BEGIN
  IF v_room_code !~ '^[A-Z2-9]{4}$' THEN
    RAISE EXCEPTION 'INVALID_ROOM_CODE';
  END IF;

  INSERT INTO public.game_rooms (
    room_code,
    host_id,
    mode,
    status,
    players,
    loser_id,
    loser_name,
    countdown_started_at,
    round_started_at,
    ended_at,
    dare_text
  ) VALUES (
    v_room_code,
    p_host_id,
    v_mode,
    'lobby',
    jsonb_build_array(jsonb_build_object(
      'playerId', p_host_id,
      'displayName', p_host_name,
      'isHost', true,
      'isReady', true,
      'motionEnabled', false,
      'joinedAt', now()::text
    )),
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  )
  RETURNING * INTO v_room;

  RETURN v_room;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'ROOM_CODE_EXISTS';
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_game_room(
  p_room_code TEXT,
  p_player_id TEXT,
  p_display_name TEXT
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room public.game_rooms;
  v_room_code TEXT := regexp_replace(upper(coalesce(p_room_code, '')), '\s+', '', 'g');
  v_player_exists BOOLEAN;
BEGIN
  IF v_room_code !~ '^[A-Z2-9]{4}$' THEN
    RAISE EXCEPTION 'INVALID_ROOM_CODE';
  END IF;

  SELECT * INTO v_room
  FROM public.game_rooms
  WHERE room_code = v_room_code
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

GRANT EXECUTE ON FUNCTION public.create_game_room(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game_room(TEXT, TEXT, TEXT) TO anon, authenticated;