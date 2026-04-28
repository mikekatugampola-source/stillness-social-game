DROP POLICY IF EXISTS "Players can create valid game rooms" ON public.game_rooms;
DROP POLICY IF EXISTS "Players can update valid game rooms" ON public.game_rooms;

CREATE OR REPLACE FUNCTION public.create_game_room(
  p_room_code TEXT,
  p_host_id TEXT,
  p_host_name TEXT,
  p_mode TEXT DEFAULT 'classic'
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_mode TEXT := CASE WHEN p_mode IN ('classic', 'dare') THEN p_mode ELSE 'classic' END;
BEGIN
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
    upper(p_room_code),
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
END;
$$;

CREATE OR REPLACE FUNCTION public.join_game_room(
  p_room_code TEXT,
  p_player_id TEXT,
  p_display_name TEXT
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_player_exists BOOLEAN;
BEGIN
  SELECT * INTO v_room
  FROM public.game_rooms
  WHERE room_code = upper(p_room_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_room.players) AS player
    WHERE player->>'playerId' = p_player_id
  ) INTO v_player_exists;

  IF NOT v_player_exists THEN
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
  END IF;

  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_game_room_player_ready(
  p_room_code TEXT,
  p_player_id TEXT,
  p_is_ready BOOLEAN
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_players JSONB;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE room_code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status <> 'lobby' THEN RETURN v_room; END IF;

  SELECT coalesce(jsonb_agg(
    CASE WHEN player->>'playerId' = p_player_id
      THEN jsonb_set(player, '{isReady}', to_jsonb(p_is_ready), true)
      ELSE player
    END
  ), '[]'::jsonb)
  INTO v_players
  FROM jsonb_array_elements(v_room.players) AS player;

  UPDATE public.game_rooms
  SET players = v_players
  WHERE room_code = v_room.room_code
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_game_room_mode(
  p_room_code TEXT,
  p_player_id TEXT,
  p_mode TEXT
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE room_code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.host_id <> p_player_id OR v_room.status <> 'lobby' OR p_mode NOT IN ('classic', 'dare') THEN RETURN v_room; END IF;

  UPDATE public.game_rooms
  SET mode = p_mode
  WHERE room_code = v_room.room_code
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_game_room_dare(
  p_room_code TEXT,
  p_player_id TEXT,
  p_dare_text TEXT
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE room_code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.host_id <> p_player_id OR v_room.status <> 'lobby' THEN RETURN v_room; END IF;

  UPDATE public.game_rooms
  SET dare_text = p_dare_text
  WHERE room_code = v_room.room_code
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_game_arming(
  p_room_code TEXT,
  p_player_id TEXT
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_players JSONB;
  v_player_count INTEGER;
  v_all_ready BOOLEAN;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE room_code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.host_id <> p_player_id OR v_room.status <> 'lobby' THEN RETURN v_room; END IF;

  SELECT count(*), coalesce(bool_and((player->>'isReady')::boolean), false)
  INTO v_player_count, v_all_ready
  FROM jsonb_array_elements(v_room.players) AS player;

  IF v_player_count < 2 OR NOT v_all_ready OR (v_room.mode = 'dare' AND coalesce(trim(v_room.dare_text), '') = '') THEN
    RETURN v_room;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_set(player, '{motionEnabled}', 'false'::jsonb, true)), '[]'::jsonb)
  INTO v_players
  FROM jsonb_array_elements(v_room.players) AS player;

  UPDATE public.game_rooms
  SET status = 'arming',
      players = v_players,
      loser_id = NULL,
      loser_name = NULL,
      countdown_started_at = NULL,
      round_started_at = NULL,
      ended_at = NULL
  WHERE room_code = v_room.room_code
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_game_room_motion_enabled(
  p_room_code TEXT,
  p_player_id TEXT
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
  v_players JSONB;
  v_all_motion BOOLEAN;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE room_code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status <> 'arming' THEN RETURN v_room; END IF;

  SELECT coalesce(jsonb_agg(
    CASE WHEN player->>'playerId' = p_player_id
      THEN jsonb_set(player, '{motionEnabled}', 'true'::jsonb, true)
      ELSE player
    END
  ), '[]'::jsonb)
  INTO v_players
  FROM jsonb_array_elements(v_room.players) AS player;

  SELECT coalesce(bool_and((player->>'motionEnabled')::boolean), false)
  INTO v_all_motion
  FROM jsonb_array_elements(v_players) AS player;

  IF v_all_motion THEN
    UPDATE public.game_rooms
    SET players = v_players,
        status = 'countdown',
        countdown_started_at = now() + interval '1 second',
        round_started_at = now() + interval '6 seconds'
    WHERE room_code = v_room.room_code
    RETURNING * INTO v_room;
  ELSE
    UPDATE public.game_rooms
    SET players = v_players
    WHERE room_code = v_room.room_code
    RETURNING * INTO v_room;
  END IF;

  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_game_if_ready(
  p_room_code TEXT
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE room_code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

  IF v_room.status = 'countdown' AND v_room.round_started_at IS NOT NULL AND v_room.round_started_at <= now() THEN
    UPDATE public.game_rooms
    SET status = 'playing'
    WHERE room_code = v_room.room_code
    RETURNING * INTO v_room;
  END IF;

  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_game_room(
  p_room_code TEXT,
  p_loser_id TEXT,
  p_loser_name TEXT
)
RETURNS public.game_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.game_rooms;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE room_code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status = 'finished' THEN RETURN v_room; END IF;
  IF v_room.status <> 'playing' THEN RETURN v_room; END IF;

  UPDATE public.game_rooms
  SET status = 'finished',
      loser_id = p_loser_id,
      loser_name = p_loser_name,
      ended_at = now()
  WHERE room_code = v_room.room_code
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game_room(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_game_room(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_game_room_player_ready(TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_game_room_mode(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_game_room_dare(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_game_arming(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_game_room_motion_enabled(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_game_if_ready(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_game_room(TEXT, TEXT, TEXT) TO anon, authenticated;