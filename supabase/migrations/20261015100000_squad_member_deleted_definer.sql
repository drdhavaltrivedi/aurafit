-- Account deletion for squad members (applies on top of 20261014140000_moderation.sql).
--
-- Supabase Auth deletes users as supabase_auth_admin; the auth.users -> profiles cascade then fires
-- trg_profiles_squad_member_deleted, which (as SECURITY INVOKER) ran with that role's privileges and
-- failed on public.squads ("Database error deleting user"). Squad members could not delete their
-- account. Like private.handle_new_user (also fired by Auth), the function now runs as its owner.
-- search_path stays '' and every name is schema-qualified; EXECUTE stays revoked from API roles.

ALTER FUNCTION private.squad_member_deleted() SECURITY DEFINER;
REVOKE ALL ON FUNCTION private.squad_member_deleted() FROM PUBLIC, anon, authenticated;
