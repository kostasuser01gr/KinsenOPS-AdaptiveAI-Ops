-- Explicit session-store schema so production does not rely on runtime DDL.
-- This matches connect-pg-simple defaults for the user_sessions table.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  sid varchar NOT NULL,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS user_sessions_expire_idx
  ON public.user_sessions (expire);