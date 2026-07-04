create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('bus15-alert-8am', 'bus15-alert-9am');
exception
  when others then
    null;
end $$;

select
  cron.schedule(
    'bus15-alert-8am',
    '15,30,45 0 * * 1-5',
    $$
    select
      net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'bus15_supabase_project_url'
        ) || '/functions/v1/bus15-telegram-alert',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'bus15_cron_secret'
          )
        ),
        body := jsonb_build_object('source', 'supabase-cron', 'window', '8am')
      ) as request_id;
    $$
  );

select
  cron.schedule(
    'bus15-alert-9am',
    '0,15 1 * * 1-5',
    $$
    select
      net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'bus15_supabase_project_url'
        ) || '/functions/v1/bus15-telegram-alert',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'bus15_cron_secret'
          )
        ),
        body := jsonb_build_object('source', 'supabase-cron', 'window', '9am')
      ) as request_id;
    $$
  );
