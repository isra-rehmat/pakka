-- =====================================================================
-- PAKKA v2 push wiring (live only). The real secret values are inserted at
-- apply time and are NOT stored in this file:
--   __PUSH_SECRET__  random shared secret between database and edge function
--   __VAPID_JWK__    VAPID private key (JWK JSON)
-- =====================================================================

select vault.create_secret('https://gsqdbfnlaqcmdvfubmxb.supabase.co/functions/v1/push', 'pakka_push_url', 'Pakka push function URL');
select vault.create_secret('__PUSH_SECRET__', 'pakka_push_secret', 'Shared secret for the push function');
select vault.create_secret('__VAPID_JWK__', 'pakka_vapid_jwk', 'VAPID private key (JWK)');

-- read by the edge function (service role only)
create or replace function public.push_config()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pakka_push_secret'),
    'jwk', (select decrypted_secret from vault.decrypted_secrets where name = 'pakka_vapid_jwk')::json,
    'subject', 'https://pakka-family.netlify.app');
$$;

create or replace function public.push_cleanup(p_endpoints text[])
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = any(p_endpoints);
$$;

revoke execute on function public.push_config(), public.push_cleanup(text[]) from public, anon, authenticated;
grant execute on function public.push_config(), public.push_cleanup(text[]) to service_role;

-- 9 PM Pakistan time = 16:00 UTC
create extension if not exists pg_cron;
select cron.schedule('pakka-night-reminder', '0 16 * * *', 'select private.send_reminders()');

-- self test from Me > Notifications
create or replace function public.push_test()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  perform private.push_to(array[auth.uid()], jsonb_build_object(
    'title', '🔔 Pakka', 'body', 'Notifications chal rahi hain! 🎉', 'url', '/?go=me', 'tag', 'test'));
end $$;
revoke execute on function public.push_test() from public, anon;
grant execute on function public.push_test() to authenticated;
