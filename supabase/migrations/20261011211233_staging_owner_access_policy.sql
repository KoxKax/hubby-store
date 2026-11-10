-- Default remains MFA. Owner-authorized password-only access is explicitly
-- bound to an Auth issuer by a trusted operator, never inferred from metadata.
-- No app role may read/write this policy; no issuer is enabled by migration.
begin;
create table private.owner_access_policy (
  singleton boolean primary key default true check (singleton),
  password_only_issuer text check (
    password_only_issuer ~ '^https://[a-z0-9-]+\.supabase\.co/auth/v1$'
  )
);
alter table private.owner_access_policy enable row level security;
revoke all on private.owner_access_policy from public,anon,authenticated,service_role;
insert into private.owner_access_policy(singleton) values(true);

create or replace function private.owner_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'owner', exists(select 1 from private.role_memberships
     where user_id=auth.uid() and role='owner' and revoked_at is null),
   'aal2', coalesce(auth.jwt()->>'aal'='aal2',false),
   'mfa_required', not coalesce(
     auth.jwt()->>'role'='authenticated'
     and auth.jwt()->>'aal' in ('aal1','aal2')
     and coalesce(auth.jwt()->>'is_anonymous','false')='false'
     and auth.jwt()->>'iss'=(select password_only_issuer from private.owner_access_policy where singleton),false),
   'password_only_issuer', (select password_only_issuer from private.owner_access_policy where singleton)
 );
$$;
create or replace function private.hubby_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.role_memberships
   where user_id=auth.uid() and role='owner' and revoked_at is null)
   and (coalesce(auth.jwt()->>'aal'='aal2',false) or coalesce(
     auth.jwt()->>'role'='authenticated'
     and auth.jwt()->>'aal'='aal1'
     and coalesce(auth.jwt()->>'is_anonymous','false')='false'
     and auth.jwt()->>'iss'=(select password_only_issuer from private.owner_access_policy where singleton),false));
$$;
-- Existing invoker wrappers/policies call these guarded private implementations.
-- CREATE OR REPLACE preserves existing narrowly granted EXECUTE permissions.
commit;
