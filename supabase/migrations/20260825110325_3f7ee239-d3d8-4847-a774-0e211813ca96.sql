-- Moves may only be written through the validated commit_move() function.
DROP POLICY IF EXISTS "Players can add moves to their own games" ON public.game_moves;

-- Each player can read back their own fair-play telemetry.
DROP POLICY IF EXISTS "Players read their own raw signals" ON public.fairplay_signals;
CREATE POLICY "Players read their own raw signals"
ON public.fairplay_signals
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);