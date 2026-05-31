-- Add metadata JSONB column to chat_messages for tool call results and UI blocks
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb;
