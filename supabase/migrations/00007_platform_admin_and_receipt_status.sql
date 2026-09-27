-- ============================================================================
-- PullUp Platform Admin & Support Enum Values
-- ============================================================================
--
-- This migration adds new user_role enum values. These must be in a
-- separate migration because PostgreSQL cannot reference new enum values
-- in the same transaction they are added.
--
-- Depends on: 00006_create_receipts_bucket.sql
-- ============================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'platform_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'platform_support';
