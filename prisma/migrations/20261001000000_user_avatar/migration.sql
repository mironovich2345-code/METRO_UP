-- AlterTable
-- Additive only, NOT destructive: nullable, no default needed. Every
-- existing user gets avatarStorageKey = NULL, identical to today's implicit
-- "no custom avatar, show initials" behavior.
ALTER TABLE "users" ADD COLUMN     "avatarStorageKey" TEXT;
