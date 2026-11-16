-- extra Supabase lookalikes for v2 tests: vault + pg_net recorder
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('pakka_push_url','https://example.test/functions/v1/push'),('pakka_push_secret','s3cret') on conflict do nothing;
create schema if not exists net;
create table if not exists net.calls (id serial, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.calls (url, body, headers) values (url, body, headers) returning id::bigint $$;
