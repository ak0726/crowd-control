CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  host_player_id UUID,
  status TEXT NOT NULL DEFAULT 'lobby',
  settings JSONB NOT NULL DEFAULT '{"timer":20,"teamEvery":3,"modes":["most","would","team"]}'::jsonb,
  round_number INTEGER NOT NULL DEFAULT 0,
  round_type TEXT,
  round_data JSONB,
  round_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)