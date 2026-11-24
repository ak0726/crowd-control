CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🦊',
  token_hash TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  team TEXT,
  connected BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, nickname)
)