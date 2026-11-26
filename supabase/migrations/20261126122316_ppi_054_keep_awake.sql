-- PPI-054: keep the free Render web service awake (owner, 26-Nov-2026: no "application loading" screen when opening the app).
-- Render Free sleeps after 15 minutes without traffic; a request every 10 minutes keeps it up. One service running all month
-- uses at most 744 of the 750 free instance hours. The address is a platform setting, so moving host needs no new migration.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net with schema extensions; end if;
end $$;

insert into private.platform_settings (key, value) values ('keep_awake_url', 'https://crux-ppi.onrender.com/manifest.webmanifest')
on conflict (key) do nothing;

create or replace function private.keep_awake() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text := (select value from private.platform_settings where key = 'keep_awake_url');
begin
  if coalesce(v_url, '') ~ '^https://' then execute 'select net.http_get(url := $1, timeout_milliseconds := 60000)' using v_url; end if;
end $$;
revoke all on function private.keep_awake() from public, anon, authenticated;

-- Scheduled only where pg_cron and pg_net exist (the hosted project; the local test database has neither).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ppi-keep-awake';
    perform cron.schedule('ppi-keep-awake', '*/10 * * * *', 'select private.keep_awake()');
  end if;
end $$;
