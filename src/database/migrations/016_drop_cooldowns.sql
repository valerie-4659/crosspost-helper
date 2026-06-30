-- Migration 016: Remove old picker cooldown tables
-- The cooldown system (picker_state / picker_cooldowns) is replaced by the
-- per-network fair-shuffle round tracking in pick_rounds / pick_history (015).

DROP TABLE IF EXISTS picker_cooldowns;
DROP TABLE IF EXISTS picker_state;
