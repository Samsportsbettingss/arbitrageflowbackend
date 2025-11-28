-- Migration: Add License Key Support
-- Adds license_key and trial_expires_at fields to users table

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS license_key VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS license_key_sent_at TIMESTAMP;

-- Create index for faster license key lookups
CREATE INDEX IF NOT EXISTS idx_users_license_key ON users(license_key);

-- Create index for trial expiration checks
CREATE INDEX IF NOT EXISTS idx_users_trial_expires ON users(trial_expires_at) WHERE trial_expires_at IS NOT NULL;

