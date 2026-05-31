-- Phase 6: Modular Widget Workspace + Ideas Hub
-- Migration: user_tabs, widget_definitions, tab_widgets, idea_comments, idea_attachments
-- Also adds 'category' column to workspace_proposals

-- ─── USER TABS ───
CREATE TABLE IF NOT EXISTS user_tabs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'LayoutGrid',
  "order" INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  template TEXT,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_tabs_user_idx ON user_tabs(user_id);
CREATE INDEX IF NOT EXISTS user_tabs_order_idx ON user_tabs(user_id, "order");

-- ─── WIDGET DEFINITIONS ───
CREATE TABLE IF NOT EXISTS widget_definitions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  icon TEXT NOT NULL DEFAULT 'Box',
  component TEXT NOT NULL,
  default_w INTEGER NOT NULL DEFAULT 4,
  default_h INTEGER NOT NULL DEFAULT 3,
  min_w INTEGER NOT NULL DEFAULT 2,
  min_h INTEGER NOT NULL DEFAULT 2,
  max_w INTEGER,
  max_h INTEGER,
  default_config JSONB,
  built_in BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS widget_defs_ws_slug_idx ON widget_definitions(workspace_id, slug);
CREATE INDEX IF NOT EXISTS widget_defs_category_idx ON widget_definitions(category);

-- ─── TAB WIDGETS ───
CREATE TABLE IF NOT EXISTS tab_widgets (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tab_id INTEGER NOT NULL REFERENCES user_tabs(id) ON DELETE CASCADE,
  widget_slug TEXT NOT NULL,
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  w INTEGER NOT NULL DEFAULT 4,
  h INTEGER NOT NULL DEFAULT 3,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tab_widgets_tab_idx ON tab_widgets(tab_id);

-- ─── ADD CATEGORY TO WORKSPACE PROPOSALS ───
ALTER TABLE workspace_proposals ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

-- ─── IDEA COMMENTS ───
CREATE TABLE IF NOT EXISTS idea_comments (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id),
  proposal_id INTEGER NOT NULL REFERENCES workspace_proposals(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  parent_id INTEGER REFERENCES idea_comments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idea_comments_proposal_idx ON idea_comments(proposal_id);
CREATE INDEX IF NOT EXISTS idea_comments_user_idx ON idea_comments(user_id);
CREATE INDEX IF NOT EXISTS idea_comments_parent_idx ON idea_comments(parent_id);

-- ─── IDEA ATTACHMENTS ───
CREATE TABLE IF NOT EXISTS idea_attachments (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES workspaces(id),
  proposal_id INTEGER NOT NULL REFERENCES workspace_proposals(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idea_attachments_proposal_idx ON idea_attachments(proposal_id);

-- ─── RLS POLICIES ───
ALTER TABLE user_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_attachments ENABLE ROW LEVEL SECURITY;

-- Seed built-in widget definitions
INSERT INTO widget_definitions (workspace_id, slug, name, description, category, icon, component, default_w, default_h, min_w, min_h, built_in)
VALUES
  ('default', 'fleet-status', 'Fleet Status', 'Real-time vehicle fleet status overview', 'fleet', 'Car', 'FleetStatusWidget', 6, 4, 3, 2, true),
  ('default', 'wash-queue', 'Wash Queue', 'Active wash queue with progress', 'ops', 'Droplets', 'WashQueueWidget', 6, 4, 3, 2, true),
  ('default', 'kpi-card', 'KPI Card', 'Single KPI metric with trend', 'analytics', 'TrendingUp', 'KpiCardWidget', 3, 2, 2, 2, true),
  ('default', 'activity-feed', 'Activity Feed', 'Recent workspace activity stream', 'general', 'Activity', 'ActivityFeedWidget', 4, 4, 3, 2, true),
  ('default', 'notifications', 'Notifications', 'Unread notifications panel', 'general', 'Bell', 'NotificationsWidget', 4, 3, 3, 2, true),
  ('default', 'quick-actions', 'Quick Actions', 'Frequently used action buttons', 'general', 'Zap', 'QuickActionsWidget', 4, 2, 2, 2, true),
  ('default', 'shift-overview', 'Shift Overview', 'Current shift schedule summary', 'ops', 'Clock', 'ShiftOverviewWidget', 6, 3, 3, 2, true),
  ('default', 'incidents', 'Open Incidents', 'Active incidents requiring attention', 'ops', 'AlertTriangle', 'IncidentsWidget', 6, 3, 3, 2, true),
  ('default', 'station-map', 'Station Map', 'Visual station capacity overview', 'fleet', 'Map', 'StationMapWidget', 6, 4, 4, 3, true),
  ('default', 'chat-summary', 'AI Chat', 'Quick AI chat interface', 'chat', 'MessageSquare', 'ChatSummaryWidget', 4, 4, 3, 3, true),
  ('default', 'reservations', 'Reservations', 'Upcoming reservation timeline', 'fleet', 'Calendar', 'ReservationsWidget', 6, 3, 3, 2, true),
  ('default', 'anomalies', 'Anomaly Alerts', 'AI-detected operational anomalies', 'analytics', 'ShieldAlert', 'AnomalyWidget', 4, 3, 3, 2, true),
  ('default', 'digital-twin', 'Digital Twin', 'Station digital twin snapshot', 'analytics', 'Layers', 'DigitalTwinWidget', 6, 4, 4, 3, true),
  ('default', 'team-online', 'Team Online', 'Currently active team members', 'general', 'Users', 'TeamOnlineWidget', 3, 3, 2, 2, true),
  ('default', 'ideas-feed', 'Ideas Feed', 'Latest staff ideas and proposals', 'general', 'Lightbulb', 'IdeasFeedWidget', 4, 4, 3, 2, true)
ON CONFLICT DO NOTHING;
