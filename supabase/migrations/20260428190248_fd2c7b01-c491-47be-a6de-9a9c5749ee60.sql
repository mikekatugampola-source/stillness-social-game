CREATE OR REPLACE FUNCTION public.game_server_now()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT now();
$$;

GRANT EXECUTE ON FUNCTION public.game_server_now() TO anon, authenticated;