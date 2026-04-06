-- Add 'type' column to distinguish collection vs inventory cards.
-- Run this in your Supabase SQL Editor.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'collection';
