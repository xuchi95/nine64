INSERT INTO public.engine_profiles (
  slug, name, runtime, enabled, is_public, status, stockfish_version, config, draft_config, has_draft, version, reason
) VALUES (
  'titan',
  'Nine64 Titan',
  'cloud',
  false,
  true,
  'draft',
  'Stockfish 18 (official)',
  '{"timePolicy":"clock","moveTimeMs":4000,"clockFraction":0.04,"maxMoveTimeMs":12000,"threads":8,"hashMb":2048,"multiPv":1,"ponder":false,"moveOverheadMs":300,"limitStrength":false,"skill":20,"uciElo":null,"openingRandomness":0,"personalityTolerance":0}'::jsonb,
  '{"timePolicy":"clock","moveTimeMs":4000,"clockFraction":0.04,"maxMoveTimeMs":12000,"threads":8,"hashMb":2048,"multiPv":1,"ponder":false,"moveOverheadMs":300,"limitStrength":false,"skill":20,"uciElo":null,"openingRandomness":0,"personalityTolerance":0}'::jsonb,
  false,
  1,
  'bootstrap: default Titan profile (fail-closed, disabled until benchmarked & published)'
)
ON CONFLICT (slug) DO NOTHING;