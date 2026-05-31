-- Secret Sentinel v4.0 — RLS Policy Migration
-- Generated: 2026-04-23
-- Purpose: Add baseline RLS policies to all tables that have RLS enabled but zero policies.
-- Review: Tighten USING clauses to auth.uid() = user_id where appropriate.

DO $$ 
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users','stations','user_preferences','vehicles','vehicle_evidence',
    'wash_queue','shifts','shift_requests','notifications','chat_conversations',
    'chat_messages','custom_actions','automation_rules','audit_log','entity_rooms',
    'room_messages','workspace_memory','digital_twin_snapshots','system_policies',
    'activity_feed','module_registry','workspace_config','file_attachments',
    'imports','notification_reads','workspace_proposals','integration_connectors',
    'sync_jobs','knowledge_documents','incident_summaries','export_requests',
    'workspace_plans','entitlement_overrides','usage_events','usage_daily_rollups',
    'user_station_assignments','role_capabilities','user_capability_overrides',
    'vehicle_events','workshop_jobs','incidents','automation_executions',
    'user_sessions','reservations','repair_orders','downtime_events',
    'kpi_definitions','kpi_snapshots','anomalies','executive_briefings',
    'workspaces','station_positions','position_assignments','vehicle_transfers',
    'chat_channels','channel_members','channel_messages','channel_reactions',
    'app_graph_versions','ai_model_usage','installed_extensions','user_api_keys',
    'ai_training_data','setup_state','login_history','notification_preferences',
    'quality_inspections','webhooks','webhook_deliveries','user_tabs',
    'widget_definitions','tab_widgets','idea_comments','idea_attachments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY "service_role_full_access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "authenticated_access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;
