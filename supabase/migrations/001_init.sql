-- =====================================================================
-- PAKKA: Family Habit Tracker  |  Database schema v1  |  2026-11-15
-- Run once on a fresh Supabase project.
-- =====================================================================

create extension if not exists pgcrypto;
create schema if not exists private;

-- ---------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'New Player' check (char_length(display_name) between 1 and 40),
  avatar        text not null default '😎',
  title         text not null default 'Naya Khiladi 🐣',
  photo_url     text,
  xp            int  not null default 0,
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 40),
  emoji        text not null default '🏠',
  invite_code  text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin','member')),
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- user_id = the person being held accountable, partner_id = the accountability partner
create table public.partnerships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  partner_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','active')),
  created_at  timestamptz not null default now(),
  unique (user_id, partner_id),
  check (user_id <> partner_id)
);

-- proof: none = just tick, photo = photo needed, approval = photo + partner approval
create table public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  emoji       text not null default '✅',
  days        int[] not null default '{0,1,2,3,4,5,6}',
  proof       text not null default 'none' check (proof in ('none','photo','approval')),
  xp          int  not null default 10,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.checkins (
  id           uuid primary key default gen_random_uuid(),
  habit_id     uuid not null references public.habits(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  day          date not null,
  status       text not null default 'done' check (status in ('done','pending','rejected')),
  proof_url    text,
  note         text check (char_length(note) <= 300),
  reviewed_by  uuid references public.profiles(id) on delete set null,
  xp_awarded   int not null default 0,
  created_at   timestamptz not null default now(),
  unique (habit_id, day)
);

-- Saza Card = consequence given by a partner
create table public.sazas (
  id            uuid primary key default gen_random_uuid(),
  target_id     uuid not null references public.profiles(id) on delete cascade,
  issued_by     uuid not null references public.profiles(id) on delete cascade,
  habit_id      uuid references public.habits(id) on delete set null,
  reason        text check (char_length(reason) <= 200),
  xp_penalty    int not null default 0 check (xp_penalty between 0 and 500),
  dare          text check (char_length(dare) <= 200),
  shame_badge   text check (char_length(shame_badge) <= 40),
  lock_rewards  boolean not null default false,
  status        text not null default 'active' check (status in ('active','submitted','done','forgiven')),
  proof_url     text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create table public.xp_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      int not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  from_id     uuid references public.profiles(id) on delete cascade,
  type        text not null,
  message     text check (char_length(message) <= 300),
  ref_id      uuid,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.messages (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  kind        text not null default 'text' check (kind in ('text','system')),
  content     text not null check (char_length(content) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create table public.achievements (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  code         text not null,
  name         text not null check (char_length(name) <= 60),
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, code)
);

create index on public.group_members (user_id);
create index on public.partnerships (partner_id);
create index on public.habits (user_id);
create index on public.checkins (user_id, day);
create index on public.sazas (target_id, status);
create index on public.xp_events (user_id, created_at);
create index on public.notifications (user_id, created_at desc);
create index on public.messages (group_id, created_at desc);

-- ---------------------------------------------------------------------
-- HELPER FUNCTIONS (private schema, not exposed by the API)
-- ---------------------------------------------------------------------
create or replace function private.is_group_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid());
$$;

create or replace function private.can_see(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select other = auth.uid()
    or exists (select 1 from public.group_members a
               join public.group_members b on a.group_id = b.group_id
               where a.user_id = auth.uid() and b.user_id = other)
    or exists (select 1 from public.partnerships p
               where (p.user_id = auth.uid() and p.partner_id = other)
                  or (p.partner_id = auth.uid() and p.user_id = other));
$$;

create or replace function private.is_partner_of(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partnerships
                 where user_id = target and partner_id = auth.uid() and status = 'active');
$$;

create or replace function private.is_locked(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sazas
                 where target_id = u and lock_rewards and status in ('active','submitted'));
$$;

create or replace function private.pname(u uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = u), 'Koi');
$$;

create or replace function private.add_xp(u uuid, amt int, why text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if amt is null or amt = 0 then return; end if;
  insert into public.xp_events (user_id, amount, reason) values (u, amt, left(why, 120));
  update public.profiles set xp = xp + amt where id = u;
end $$;

-- system message to every group the user is in
create or replace function private.post_system(u uuid, txt text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.messages (group_id, user_id, kind, content)
  select gm.group_id, u, 'system', left(txt, 2000) from public.group_members gm where gm.user_id = u;
end $$;

create or replace function private.post_group(g uuid, u uuid, txt text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.messages (group_id, user_id, kind, content) values (g, u, 'system', left(txt, 2000));
end $$;

create or replace function private.notify(to_user uuid, from_user uuid, ntype text, msg text, ref uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if to_user is null or to_user = from_user then return; end if;
  insert into public.notifications (user_id, from_id, type, message, ref_id)
  values (to_user, from_user, ntype, left(msg, 300), ref);
end $$;

create or replace function private.notify_partners(u uuid, ntype text, msg text, ref uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, from_id, type, message, ref_id)
  select p.partner_id, u, ntype, left(msg, 300), ref
  from public.partnerships p where p.user_id = u and p.status = 'active';
end $$;

-- ---------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------

-- New Google user -> profile
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, photo_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),
                  nullif(new.raw_user_meta_data->>'name',''),
                  nullif(split_part(coalesce(new.email,''),'@',1),''),
                  'New Player'), 40),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Profiles: avatar/title cannot change while rewards are locked
create or replace function private.profile_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.avatar is distinct from old.avatar or new.title is distinct from old.title)
     and private.is_locked(old.id) then
    raise exception '🔒 Rewards locked hain! Pehle saza poori karo.';
  end if;
  return new;
end $$;
create trigger profile_guard before update on public.profiles
  for each row execute function private.profile_guard();

-- Habits: XP depends on proof type
create or replace function private.habit_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  new.xp := case new.proof when 'none' then 10 when 'photo' then 15 else 20 end;
  if new.days is null or cardinality(new.days) = 0 then new.days := '{0,1,2,3,4,5,6}'; end if;
  return new;
end $$;
create trigger habit_defaults before insert or update on public.habits
  for each row execute function private.habit_defaults();

-- Check-ins
create or replace function private.checkin_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare h public.habits;
begin
  select * into h from public.habits where id = new.habit_id;
  if h.id is null or h.user_id <> new.user_id then raise exception 'Habit not found'; end if;
  if h.archived then raise exception 'This habit is archived'; end if;
  if new.day < current_date - 2 or new.day > current_date + 1 then
    raise exception 'Sirf aaj ka check-in ho sakta hai';
  end if;
  if h.proof <> 'none' and coalesce(new.proof_url, '') = '' then
    raise exception 'Is habit ke liye photo proof chahiye 📸';
  end if;
  new.reviewed_by := null;
  if h.proof = 'approval' then
    new.status := 'pending';
    new.xp_awarded := 0;
  else
    new.status := 'done';
    new.xp_awarded := case when private.is_locked(new.user_id) then 0 else h.xp end;
  end if;
  return new;
end $$;
create trigger checkin_before_insert before insert on public.checkins
  for each row execute function private.checkin_before_insert();

create or replace function private.checkin_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare h public.habits; nm text;
begin
  select * into h from public.habits where id = new.habit_id;
  nm := private.pname(new.user_id);
  if new.status = 'done' then
    perform private.add_xp(new.user_id, new.xp_awarded, 'Check-in: ' || h.title);
    perform private.post_system(new.user_id,
      '✅ ' || nm || ' ne "' || h.emoji || ' ' || h.title || '" complete kiya! ' ||
      case when new.xp_awarded > 0 then '+' || new.xp_awarded || ' XP' else '(🔒 XP locked)' end);
  else
    perform private.notify_partners(new.user_id, 'approval_needed',
      nm || ' ne "' || h.emoji || ' ' || h.title || '" ka proof bheja hai. Check karo! 🧐', new.id);
  end if;
  return new;
end $$;
create trigger checkin_after_insert after insert on public.checkins
  for each row execute function private.checkin_after_insert();

-- Partner reviews a pending check-in
create or replace function private.checkin_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare h public.habits;
begin
  if old.status <> 'pending' or new.status not in ('done','rejected') then
    raise exception 'Ye check-in pehle hi review ho chuka hai';
  end if;
  if not private.is_partner_of(old.user_id) then
    raise exception 'Sirf accountability partner approve kar sakta hai';
  end if;
  new.habit_id := old.habit_id; new.user_id := old.user_id; new.day := old.day;
  new.proof_url := old.proof_url; new.note := old.note; new.created_at := old.created_at;
  new.reviewed_by := auth.uid();
  if new.status = 'done' then
    select * into h from public.habits where id = old.habit_id;
    new.xp_awarded := case when private.is_locked(old.user_id) then 0 else h.xp end;
  else
    new.xp_awarded := 0;
  end if;
  return new;
end $$;
create trigger checkin_before_update before update on public.checkins
  for each row execute function private.checkin_before_update();

create or replace function private.checkin_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare h public.habits; nm text; rv text;
begin
  select * into h from public.habits where id = new.habit_id;
  nm := private.pname(new.user_id);
  rv := private.pname(new.reviewed_by);
  if new.status = 'done' then
    perform private.add_xp(new.user_id, new.xp_awarded, 'Approved: ' || h.title);
    perform private.notify(new.user_id, new.reviewed_by, 'approved',
      '✅ ' || rv || ' ne tumhara "' || h.title || '" approve kar diya! ' ||
      case when new.xp_awarded > 0 then '+' || new.xp_awarded || ' XP' else '(🔒 XP locked)' end, new.id);
    perform private.post_system(new.user_id,
      '✅ ' || nm || ' ne "' || h.emoji || ' ' || h.title || '" complete kiya! (approved by ' || rv || ')');
  else
    perform private.notify(new.user_id, new.reviewed_by, 'rejected',
      '❌ ' || rv || ' ne tumhara "' || h.title || '" reject kar diya. Dobara karo!', new.id);
  end if;
  return new;
end $$;
create trigger checkin_after_update after update on public.checkins
  for each row execute function private.checkin_after_update();

create or replace function private.checkin_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.xp_awarded > 0 then
    perform private.add_xp(old.user_id, -old.xp_awarded, 'Undo check-in');
  end if;
  return old;
end $$;
create trigger checkin_after_delete after delete on public.checkins
  for each row execute function private.checkin_after_delete();

-- Partnerships
create or replace function private.partner_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.partner_id <> auth.uid() or old.status <> 'pending' or new.status <> 'active' then
    raise exception 'Not allowed';
  end if;
  new.user_id := old.user_id; new.partner_id := old.partner_id; new.created_at := old.created_at;
  return new;
end $$;
create trigger partner_before_update before update on public.partnerships
  for each row execute function private.partner_before_update();

create or replace function private.partner_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.partner_id, new.user_id, 'partner_request',
      private.pname(new.user_id) || ' ne tumhe apna accountability partner banne ki request bheji hai! 🤝', new.id);
  elsif tg_op = 'UPDATE' then
    perform private.notify(new.user_id, new.partner_id, 'partner_accepted',
      private.pname(new.partner_id) || ' ab tumhara accountability partner hai. Ab bachna mushkil hai 😈', new.id);
    perform private.post_system(new.user_id,
      '🤝 ' || private.pname(new.partner_id) || ' ab ' || private.pname(new.user_id) || ' ka accountability partner hai!');
  elsif tg_op = 'DELETE' then
    if old.status = 'active' then
      perform private.notify(old.user_id, old.partner_id, 'partner_released',
        private.pname(old.partner_id) || ' ne tumhe partnership se azad kar diya. 🕊️', old.id);
    end if;
    return old;
  end if;
  return new;
end $$;
create trigger partner_after_change after insert or update or delete on public.partnerships
  for each row execute function private.partner_after_change();

-- Saza Cards
create or replace function private.saza_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.issued_by := auth.uid();
  if not private.is_partner_of(new.target_id) then
    raise exception 'Sirf accountability partner Saza Card de sakta hai';
  end if;
  new.status := 'active'; new.proof_url := null; new.resolved_at := null;
  new.dare := nullif(trim(coalesce(new.dare, '')), '');
  new.shame_badge := nullif(trim(coalesce(new.shame_badge, '')), '');
  if new.xp_penalty = 0 and new.dare is null and new.shame_badge is null and not new.lock_rewards then
    raise exception 'Saza Card khaali hai';
  end if;
  return new;
end $$;
create trigger saza_before_insert before insert on public.sazas
  for each row execute function private.saza_before_insert();

create or replace function private.saza_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare parts text := '';
begin
  perform private.add_xp(new.target_id, -new.xp_penalty, 'Saza Card');
  if new.xp_penalty > 0 then parts := parts || ' -' || new.xp_penalty || ' XP.'; end if;
  if new.dare is not null then parts := parts || ' Dare: ' || new.dare || '.'; end if;
  if new.shame_badge is not null then parts := parts || ' Badge: ' || new.shame_badge || '.'; end if;
  if new.lock_rewards then parts := parts || ' 🔒 Rewards locked.'; end if;
  perform private.notify(new.target_id, new.issued_by, 'saza',
    '😈 ' || private.pname(new.issued_by) || ' ne tumhe Saza Card diya!' || parts, new.id);
  perform private.post_system(new.target_id,
    '😈 ' || private.pname(new.issued_by) || ' ne ' || private.pname(new.target_id) || ' ko Saza Card diya!' || parts);
  return new;
end $$;
create trigger saza_after_insert after insert on public.sazas
  for each row execute function private.saza_after_insert();

create or replace function private.saza_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare nstatus text := new.status; nproof text := new.proof_url;
begin
  if auth.uid() = old.target_id then
    if old.status <> 'active' or nstatus <> 'submitted' or old.dare is null then
      raise exception 'Not allowed';
    end if;
  elsif private.is_partner_of(old.target_id) then
    if old.status not in ('active','submitted') then raise exception 'Ye saza pehle hi khatam ho chuki hai'; end if;
    if nstatus not in ('done','forgiven','active') then raise exception 'Not allowed'; end if;
    if nstatus = 'active' then nproof := null; end if;
  else
    raise exception 'Not allowed';
  end if;
  new := old;
  new.status := nstatus;
  new.proof_url := nproof;
  new.resolved_at := case when nstatus in ('done','forgiven') then now() else null end;
  return new;
end $$;
create trigger saza_before_update before update on public.sazas
  for each row execute function private.saza_before_update();

create or replace function private.saza_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if new.status = 'submitted' then
    perform private.notify_partners(new.target_id, 'saza_submitted',
      private.pname(new.target_id) || ' ne saza ka proof bheja: "' || coalesce(new.dare, '') || '". Check karo! 🧐', new.id);
  elsif new.status = 'done' then
    perform private.add_xp(new.target_id, 5, 'Saza poori ki');
    perform private.notify(new.target_id, me, 'saza_done',
      '🎉 ' || private.pname(me) || ' ne saza approve kar di. Tum azad ho! +5 XP', new.id);
    perform private.post_system(new.target_id, '😇 ' || private.pname(new.target_id) || ' ne saza poori kar li!');
  elsif new.status = 'forgiven' then
    perform private.notify(new.target_id, me, 'saza_forgiven',
      '🙏 ' || private.pname(me) || ' ne tumhe maaf kar diya. Agli baar nahi! 😤', new.id);
  elsif new.status = 'active' and old.status = 'submitted' then
    perform private.notify(new.target_id, me, 'saza_rejected',
      '❌ ' || private.pname(me) || ' ko proof pasand nahi aaya. Dobara karo!', new.id);
  end if;
  return new;
end $$;
create trigger saza_after_update after update on public.sazas
  for each row execute function private.saza_after_update();

-- Achievements: +25 XP and a chat shout
create or replace function private.achievement_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.add_xp(new.user_id, 25, 'Achievement: ' || new.name);
  perform private.post_system(new.user_id, '🏅 ' || private.pname(new.user_id) || ' ne achievement unlock kiya: ' || new.name || '!');
  return new;
end $$;
create trigger achievement_after_insert after insert on public.achievements
  for each row execute function private.achievement_after_insert();

-- ---------------------------------------------------------------------
-- RPC FUNCTIONS (called from the app)
-- ---------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_emoji text default '🏠')
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Group ka naam likho'; end if;
  insert into public.groups (name, emoji, created_by)
  values (left(trim(p_name), 40), coalesce(nullif(p_emoji, ''), '🏠'), auth.uid())
  returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'admin');
  perform private.post_group(g.id, auth.uid(),
    '🎉 ' || private.pname(auth.uid()) || ' ne "' || g.name || '" group banaya! Invite code: ' || g.invite_code);
  return g;
end $$;

create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  select * into g from public.groups where invite_code = upper(trim(p_code));
  if g.id is null then raise exception 'Ye invite code galat hai 🤔'; end if;
  if not exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) then
    if (select count(*) from public.group_members where group_id = g.id) >= 30 then
      raise exception 'Group full hai (30 log max)';
    end if;
    insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
    perform private.post_group(g.id, auth.uid(), '👋 ' || private.pname(auth.uid()) || ' ne group join kar liya!');
  end if;
  return g;
end $$;

create or replace function public.leaderboard(p_group uuid)
returns table (user_id uuid, display_name text, avatar text, title text, xp int, weekly_xp int)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar, p.title, p.xp,
         coalesce((select sum(e.amount) from public.xp_events e
                   where e.user_id = p.id and e.created_at > now() - interval '7 days'), 0)::int
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group and private.is_group_member(p_group)
  order by p.xp desc;
$$;

-- ---------------------------------------------------------------------
-- PERMISSIONS
-- ---------------------------------------------------------------------
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_group_member(uuid), private.can_see(uuid),
                          private.is_partner_of(uuid), private.is_locked(uuid)
  to anon, authenticated;

revoke execute on function public.create_group(text, text), public.join_group(text), public.leaderboard(uuid) from public, anon;
grant execute on function public.create_group(text, text), public.join_group(text), public.leaderboard(uuid) to authenticated;

-- explicit base grants (row level security below decides which rows)
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- profiles: users may only edit a few columns of their own row
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, avatar, title, onboarded) on public.profiles to authenticated;
-- these are written only by functions
revoke insert, update, delete on public.xp_events from anon, authenticated;
revoke insert, update, delete on public.groups from anon, authenticated;
revoke insert, update on public.group_members from anon, authenticated;
revoke update on public.messages from anon, authenticated;
revoke update, delete on public.achievements from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.partnerships  enable row level security;
alter table public.habits        enable row level security;
alter table public.checkins      enable row level security;
alter table public.sazas         enable row level security;
alter table public.xp_events     enable row level security;
alter table public.notifications enable row level security;
alter table public.messages      enable row level security;
alter table public.achievements  enable row level security;

create policy "see people in my circle" on public.profiles for select to authenticated
  using (private.can_see(id));
create policy "edit my profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "see my groups" on public.groups for select to authenticated
  using (private.is_group_member(id));

create policy "see members of my groups" on public.group_members for select to authenticated
  using (private.is_group_member(group_id));
create policy "leave a group" on public.group_members for delete to authenticated
  using (user_id = auth.uid());

create policy "see my partnerships" on public.partnerships for select to authenticated
  using (user_id = auth.uid() or partner_id = auth.uid());
create policy "ask someone to be my partner" on public.partnerships for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and private.can_see(partner_id));
create policy "partner accepts" on public.partnerships for update to authenticated
  using (partner_id = auth.uid());
create policy "partner releases or I cancel a request" on public.partnerships for delete to authenticated
  using (partner_id = auth.uid() or (user_id = auth.uid() and status = 'pending'));

create policy "see habits in my circle" on public.habits for select to authenticated
  using (private.can_see(user_id));
create policy "add my habits" on public.habits for insert to authenticated
  with check (user_id = auth.uid());
create policy "edit my habits" on public.habits for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete my habits" on public.habits for delete to authenticated
  using (user_id = auth.uid());

create policy "see check-ins in my circle" on public.checkins for select to authenticated
  using (private.can_see(user_id));
create policy "check in my habits" on public.checkins for insert to authenticated
  with check (user_id = auth.uid());
create policy "partner reviews" on public.checkins for update to authenticated
  using (private.is_partner_of(user_id));
create policy "undo my recent check-in" on public.checkins for delete to authenticated
  using (user_id = auth.uid() and day >= current_date - 2);

create policy "see sazas in my circle" on public.sazas for select to authenticated
  using (private.can_see(target_id));
create policy "partner gives saza" on public.sazas for insert to authenticated
  with check (private.is_partner_of(target_id));
create policy "target or partner updates saza" on public.sazas for update to authenticated
  using (target_id = auth.uid() or private.is_partner_of(target_id));

create policy "see xp in my circle" on public.xp_events for select to authenticated
  using (private.can_see(user_id));

create policy "see my notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid() or from_id = auth.uid());
create policy "send poke or cheer" on public.notifications for insert to authenticated
  with check (from_id = auth.uid() and type in ('poke','cheer') and private.can_see(user_id) and user_id <> auth.uid());
create policy "mark my notifications read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear my notifications" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create policy "read my group chats" on public.messages for select to authenticated
  using (private.is_group_member(group_id));
create policy "send chat message" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and kind = 'text' and private.is_group_member(group_id));
create policy "delete my message" on public.messages for delete to authenticated
  using (user_id = auth.uid() and kind = 'text');

create policy "see achievements in my circle" on public.achievements for select to authenticated
  using (private.can_see(user_id));
create policy "unlock my achievement" on public.achievements for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.messages, public.notifications, public.checkins, public.sazas, public.partnerships;

-- ---------------------------------------------------------------------
-- STORAGE: photo proofs (public bucket, random file names)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "upload my proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete my proofs" on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
