-- PAKKA v2 hardening (2026-11-16)
-- 1) pg_net out of the public schema
drop extension if exists pg_net;
create extension pg_net with schema extensions;

-- 2) only real browser push services can be registered as endpoints
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  if char_length(p_endpoint) > 1000 or p_endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]*push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'Unsupported push service';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, left(p_p256dh, 200), left(p_auth, 100), left(p_ua, 300));
  delete from public.push_subscriptions where user_id = auth.uid() and id not in
    (select id from public.push_subscriptions where user_id = auth.uid() order by created_at desc limit 8);
end $$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
