-- =====================================================================
-- PAKKA v2  |  2026-11-16
-- group types + shared group tasks, join requests, fair Saza + appeals,
-- reactions + stickers, todos, bio, chat privacy, no announcements, push
-- Safe to run on the live v1 database (keeps all data).
-- =====================================================================

create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------
create or replace function private.local_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Karachi')::date;
$$;

create or replace function private.is_group_admin(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid() and role = 'admin');
$$;



-- ---------------------------------------------------------------------
-- PROFILES: bio + notification settings
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists bio text check (char_length(bio) <= 120);
alter table public.profiles add column if not exists push_chat boolean not null default true;
alter table public.profiles add column if not exists push_reminder boolean not null default true;
grant update (bio, push_chat, push_reminder) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- GROUPS: general vs focused, admins can edit
-- ---------------------------------------------------------------------
alter table public.groups add column if not exists kind text not null default 'general' check (kind in ('general','focused'));

create or replace function private.shares_general_group(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members a
                 join public.group_members b on a.group_id = b.group_id
                 join public.groups g on g.id = a.group_id
                 where a.user_id = auth.uid() and b.user_id = other and g.kind = 'general');
$$;
grant update (name, emoji, kind) on public.groups to authenticated;
create policy "admins edit group" on public.groups for update to authenticated
  using (private.is_group_admin(id)) with check (private.is_group_admin(id));

-- ---------------------------------------------------------------------
-- JOIN REQUESTS (admin approves new members)
-- ---------------------------------------------------------------------
create table public.join_requests (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.join_requests (user_id);
alter table public.join_requests enable row level security;

create or replace function private.has_join_request(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.join_requests where group_id = g and user_id = auth.uid());
$$;

-- people can see: shared group, partnership, or someone asking to join a group I run
create or replace function private.can_see(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select other = auth.uid()
    or exists (select 1 from public.group_members a
               join public.group_members b on a.group_id = b.group_id
               where a.user_id = auth.uid() and b.user_id = other)
    or exists (select 1 from public.partnerships p
               where (p.user_id = auth.uid() and p.partner_id = other)
                  or (p.partner_id = auth.uid() and p.user_id = other))
    or exists (select 1 from public.join_requests r
               join public.group_members m on m.group_id = r.group_id
               where r.user_id = other and m.user_id = auth.uid() and m.role = 'admin');
$$;

create policy "see my requests, admins see theirs" on public.join_requests for select to authenticated
  using (user_id = auth.uid() or private.is_group_admin(group_id));
create policy "cancel my request" on public.join_requests for delete to authenticated
  using (user_id = auth.uid());

drop policy "see my groups" on public.groups;
create policy "see my groups" on public.groups for select to authenticated
  using (private.is_group_member(id) or private.has_join_request(id));

-- ---------------------------------------------------------------------
-- GROUP RPCs
-- ---------------------------------------------------------------------
drop function public.create_group(text, text);
create or replace function public.create_group(p_name text, p_emoji text default '🏠', p_kind text default 'general')
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Group ka naam likho'; end if;
  insert into public.groups (name, emoji, kind, created_by)
  values (left(trim(p_name), 40), coalesce(nullif(p_emoji, ''), '🏠'),
          case when p_kind = 'focused' then 'focused' else 'general' end, auth.uid())
  returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'admin');
  perform private.post_group(g.id, auth.uid(), '🎉 ' || private.pname(auth.uid()) || ' ne "' || g.name || '" group banaya');
  return g;
end $$;

drop function public.join_group(text);
create or replace function public.join_group(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  select * into g from public.groups where invite_code = upper(trim(p_code));
  if g.id is null then raise exception 'Ye invite code galat hai 🤔'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) then
    return json_build_object('status', 'member', 'group_id', g.id, 'name', g.name);
  end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 30 then
    raise exception 'Group full hai (30 log max)';
  end if;
  insert into public.join_requests (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  if found then
    insert into public.notifications (user_id, from_id, type, message, ref_id)
    select m.user_id, auth.uid(), 'join_request',
           private.pname(auth.uid()) || ' "' || g.name || '" join karna chahte hain 🙋', g.id
    from public.group_members m where m.group_id = g.id and m.role = 'admin';
  end if;
  return json_build_object('status', 'requested', 'group_id', g.id, 'name', g.name);
end $$;

create or replace function public.respond_join(p_group uuid, p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare gname text;
begin
  if not private.is_group_admin(p_group) then raise exception 'Sirf admin approve kar sakta hai'; end if;
  delete from public.join_requests where group_id = p_group and user_id = p_user;
  if not found then raise exception 'Request nahi mili'; end if;
  select name into gname from public.groups where id = p_group;
  if p_accept then
    if (select count(*) from public.group_members where group_id = p_group) >= 30 then
      raise exception 'Group full hai (30 log max)';
    end if;
    insert into public.group_members (group_id, user_id) values (p_group, p_user) on conflict do nothing;
    perform private.post_group(p_group, p_user, '👋 ' || private.pname(p_user) || ' ne group join kar liya');
    perform private.notify(p_user, auth.uid(), 'join_approved', 'Tum "' || gname || '" mein aa gaye! 🎉', p_group);
  else
    perform private.notify(p_user, auth.uid(), 'join_declined', '"' || gname || '" ki request accept nahi hui', p_group);
  end if;
end $$;

create or replace function public.remove_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gname text;
begin
  if not private.is_group_admin(p_group) then raise exception 'Sirf admin nikal sakta hai'; end if;
  if p_user = auth.uid() then raise exception 'Khud ko nikalne ke liye Leave dabao'; end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = p_user and role = 'admin') then
    raise exception 'Admin ko nahi nikal sakte';
  end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
  if not found then raise exception 'Member nahi mila'; end if;
  select name into gname from public.groups where id = p_group;
  perform private.post_group(p_group, p_user, private.pname(p_user) || ' ko group se nikal diya gaya');
  perform private.notify(p_user, auth.uid(), 'removed', 'Tumhe "' || gname || '" se nikal diya gaya', p_group);
end $$;

-- when someone leaves: chat note + keep at least one admin
create or replace function private.member_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare nxt uuid;
begin
  if auth.uid() = old.user_id then
    perform private.post_group(old.group_id, old.user_id, private.pname(old.user_id) || ' ne group chhor diya');
  end if;
  if old.role = 'admin' and not exists (select 1 from public.group_members where group_id = old.group_id and role = 'admin') then
    select user_id into nxt from public.group_members where group_id = old.group_id order by joined_at limit 1;
    if nxt is not null then
      update public.group_members set role = 'admin' where group_id = old.group_id and user_id = nxt;
    end if;
  end if;
  return old;
end $$;
create trigger member_after_delete after delete on public.group_members
  for each row execute function private.member_after_delete();

-- ---------------------------------------------------------------------
-- CHAT: new members only see messages after joining, stickers, reactions
-- ---------------------------------------------------------------------
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text','system','sticker'));

create or replace function private.can_read_msg(g uuid, t timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members
                 where group_id = g and user_id = auth.uid() and joined_at <= t);
$$;

create or replace function private.can_read_msg_id(m bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.messages x
                 join public.group_members gm on gm.group_id = x.group_id
                 where x.id = m and gm.user_id = auth.uid() and gm.joined_at <= x.created_at);
$$;

drop policy "read my group chats" on public.messages;
create policy "read my group chats" on public.messages for select to authenticated
  using (private.can_read_msg(group_id, created_at));
drop policy "send chat message" on public.messages;
create policy "send chat message" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and kind in ('text','sticker') and private.is_group_member(group_id));
drop policy "delete my message" on public.messages;
create policy "delete my message" on public.messages for delete to authenticated
  using (user_id = auth.uid() and kind in ('text','sticker'));

-- remove old activity announcements (keep group create/join/leave notes)
delete from public.messages where kind = 'system' and content ~ '^(✅|😈|😇|🏅|🤝)';

create table public.message_reactions (
  message_id  bigint not null references public.messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions enable row level security;
create policy "see reactions" on public.message_reactions for select to authenticated
  using (private.can_read_msg_id(message_id));
create policy "react" on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and private.can_read_msg_id(message_id));
create policy "change my reaction" on public.message_reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "remove my reaction" on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- HABITS: shared group tasks + who can see what
-- ---------------------------------------------------------------------
alter table public.habits add column if not exists group_id uuid references public.groups(id) on delete cascade;
create index if not exists habits_group_id_idx on public.habits (group_id);

create or replace function private.can_see_personal(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select u = auth.uid() or private.is_partner_of(u) or private.shares_general_group(u);
$$;

create or replace function private.can_see_group_habit(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_group_member(g)
    or exists (select 1 from public.partnerships p
               join public.group_members gm on gm.user_id = p.user_id
               where p.partner_id = auth.uid() and p.status = 'active' and gm.group_id = g);
$$;

create or replace function private.can_see_habit(h_user uuid, h_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when h_group is null then private.can_see_personal(h_user)
              else private.can_see_group_habit(h_group) end;
$$;

drop policy "see habits in my circle" on public.habits;
create policy "see habits" on public.habits for select to authenticated
  using (private.can_see_habit(user_id, group_id));
drop policy "add my habits" on public.habits;
create policy "add habits" on public.habits for insert to authenticated
  with check (user_id = auth.uid() and (group_id is null or private.is_group_admin(group_id)));
drop policy "edit my habits" on public.habits;
create policy "edit habits" on public.habits for update to authenticated
  using (case when group_id is null then user_id = auth.uid() else private.is_group_admin(group_id) end)
  with check (case when group_id is null then user_id = auth.uid() else private.is_group_admin(group_id) end);
drop policy "delete my habits" on public.habits;
create policy "delete habits" on public.habits for delete to authenticated
  using (case when group_id is null then user_id = auth.uid() else private.is_group_admin(group_id) end);

-- habits a viewer may see for one person, with the date each one started counting for them
create or replace function public.habits_for(p_user uuid)
returns table (id uuid, user_id uuid, group_id uuid, title text, emoji text, days int[], proof text,
               xp int, created_at timestamptz, since timestamptz)
language sql stable security definer set search_path = public as $$
  select h.id, h.user_id, h.group_id, h.title, h.emoji, h.days, h.proof, h.xp, h.created_at,
         case when h.group_id is null then h.created_at else greatest(h.created_at, gm.joined_at) end
  from public.habits h
  left join public.group_members gm on gm.group_id = h.group_id and gm.user_id = p_user
  where not h.archived
    and ((h.group_id is null and h.user_id = p_user and private.can_see_personal(p_user))
      or (h.group_id is not null and gm.user_id is not null
          and (private.is_group_member(h.group_id) or private.is_partner_of(p_user))))
  order by h.group_id nulls first, h.created_at;
$$;

-- ---------------------------------------------------------------------
-- CHECK-INS: one per person per habit per day, no chat announcements
-- ---------------------------------------------------------------------
alter table public.checkins drop constraint checkins_habit_id_day_key;
alter table public.checkins add constraint checkins_habit_user_day_key unique (habit_id, user_id, day);

create or replace function private.can_see_checkin(c_user uuid, c_habit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select c_user = auth.uid() or private.is_partner_of(c_user)
    or exists (select 1 from public.habits h where h.id = c_habit and (
         (h.group_id is not null and private.is_group_member(h.group_id))
      or (h.group_id is null and private.shares_general_group(c_user))));
$$;

drop policy "see check-ins in my circle" on public.checkins;
create policy "see check-ins" on public.checkins for select to authenticated
  using (private.can_see_checkin(user_id, habit_id));

create or replace function private.checkin_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare h public.habits;
begin
  select * into h from public.habits where id = new.habit_id;
  if h.id is null then raise exception 'Habit not found'; end if;
  if h.group_id is null then
    if h.user_id <> new.user_id then raise exception 'Habit not found'; end if;
  elsif not exists (select 1 from public.group_members where group_id = h.group_id and user_id = new.user_id) then
    raise exception 'Ye group task tumhara nahi';
  end if;
  if h.archived then raise exception 'This habit is archived'; end if;
  if new.day < private.local_today() - 1 or new.day > private.local_today() + 1 then
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

create or replace function private.checkin_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare h public.habits;
begin
  select * into h from public.habits where id = new.habit_id;
  if new.status = 'done' then
    perform private.add_xp(new.user_id, new.xp_awarded, 'Check-in: ' || h.title);
  else
    perform private.notify_partners(new.user_id, 'approval_needed',
      private.pname(new.user_id) || ' ne "' || h.emoji || ' ' || h.title || '" ka proof bheja hai. Check karo! 🧐', new.id);
  end if;
  return new;
end $$;

create or replace function private.checkin_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare h public.habits; rv text;
begin
  select * into h from public.habits where id = new.habit_id;
  rv := private.pname(new.reviewed_by);
  if new.status = 'done' then
    perform private.add_xp(new.user_id, new.xp_awarded, 'Approved: ' || h.title);
    perform private.notify(new.user_id, new.reviewed_by, 'approved',
      '✅ ' || rv || ' ne tumhara "' || h.title || '" approve kar diya! ' ||
      case when new.xp_awarded > 0 then '+' || new.xp_awarded || ' XP' else '(🔒 XP locked)' end, new.id);
  else
    perform private.notify(new.user_id, new.reviewed_by, 'rejected',
      '❌ ' || rv || ' ne tumhara "' || h.title || '" reject kar diya. Dobara karo!', new.id);
  end if;
  return new;
end $$;

-- partners & achievements: notifications only, no chat posts
create or replace function private.partner_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.partner_id, new.user_id, 'partner_request',
      private.pname(new.user_id) || ' ne tumhe apna accountability partner banne ki request bheji hai! 🤝', new.id);
  elsif tg_op = 'UPDATE' then
    perform private.notify(new.user_id, new.partner_id, 'partner_accepted',
      private.pname(new.partner_id) || ' ab tumhara accountability partner hai. Ab bachna mushkil hai 😈', new.id);
  elsif tg_op = 'DELETE' then
    if old.status = 'active' then
      perform private.notify(old.user_id, old.partner_id, 'partner_released',
        private.pname(old.partner_id) || ' ne tumhe partnership se azad kar diya. 🕊️', old.id);
    end if;
    return old;
  end if;
  return new;
end $$;

create or replace function private.achievement_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.add_xp(new.user_id, 25, 'Achievement: ' || new.name);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- FAIR SAZA: only real misses, 1/day per partner, 10 XP per missed day, appeals
-- ---------------------------------------------------------------------
alter table public.sazas add column if not exists missed_days date[];
alter table public.sazas add column if not exists appeal_reason text check (char_length(appeal_reason) <= 200);
alter table public.sazas add column if not exists appealed_at timestamptz;
alter table public.sazas add column if not exists decided_by uuid references public.profiles(id) on delete set null;
alter table public.sazas drop constraint sazas_status_check;
alter table public.sazas add constraint sazas_status_check
  check (status in ('active','submitted','done','forgiven','appealed','overturned'));

-- scheduled days in the last 7 days (not today, not the start day) with no check-in and no earlier Saza
create or replace function private.missed_days(p_user uuid, p_habit uuid)
returns date[] language plpgsql stable security definer set search_path = public as $$
declare h public.habits; since date; t date := private.local_today(); d date; out date[] := '{}';
begin
  select * into h from public.habits where id = p_habit;
  if h.id is null or h.archived then return out; end if;
  if h.group_id is null then
    if h.user_id <> p_user then return out; end if;
    since := (h.created_at at time zone 'Asia/Karachi')::date;
  else
    select greatest((h.created_at at time zone 'Asia/Karachi')::date, (gm.joined_at at time zone 'Asia/Karachi')::date)
      into since from public.group_members gm where gm.group_id = h.group_id and gm.user_id = p_user;
    if since is null then return out; end if;
  end if;
  for i in 1..7 loop
    d := t - i;
    if d > since and extract(dow from d)::int = any(h.days)
       and not exists (select 1 from public.checkins c where c.habit_id = p_habit and c.user_id = p_user
                       and c.day = d and c.status in ('done','pending'))
       and not exists (select 1 from public.sazas s where s.target_id = p_user and s.habit_id = p_habit
                       and d = any(s.missed_days)) then
      out := out || d;
    end if;
  end loop;
  return out;
end $$;

-- what a partner is allowed to punish right now
create or replace function public.saza_options(p_user uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare last_at timestamptz; res json;
begin
  if not private.is_partner_of(p_user) then return json_build_object('allowed', false, 'habits', '[]'::json); end if;
  select max(created_at) into last_at from public.sazas where issued_by = auth.uid() and target_id = p_user;
  select coalesce(json_agg(x), '[]'::json) into res from (
    select h.id as habit_id, h.title, h.emoji, h.group_id, private.missed_days(p_user, h.id) as missed
    from public.habits h
    where not h.archived
      and ((h.group_id is null and h.user_id = p_user)
        or h.group_id in (select group_id from public.group_members where user_id = p_user))
  ) x where cardinality(x.missed) > 0;
  return json_build_object(
    'allowed', last_at is null or last_at < now() - interval '24 hours',
    'next_at', case when last_at is null then null else last_at + interval '24 hours' end,
    'habits', res);
end $$;

create or replace function private.saza_judges(p_saza uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with s as (select target_id, issued_by from public.sazas where id = p_saza),
  shared as (select a.group_id from public.group_members a
             join public.group_members b on a.group_id = b.group_id
             cross join s where a.user_id = s.target_id and b.user_id = s.issued_by),
  cands as (select distinct gm.user_id, gm.role from public.group_members gm cross join s
            where gm.group_id in (select group_id from shared)
              and gm.user_id <> s.target_id and gm.user_id <> s.issued_by)
  select user_id from cands where role = 'admin'
  union
  select user_id from cands where not exists (select 1 from cands where role = 'admin');
$$;

create or replace function private.is_saza_judge(p_saza uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (select private.saza_judges(p_saza));
$$;

create or replace function private.saza_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  new.issued_by := auth.uid();
  if not private.is_partner_of(new.target_id) then
    raise exception 'Sirf accountability partner Saza Card de sakta hai';
  end if;
  if new.habit_id is null then raise exception 'Saza sirf kisi missed habit par di ja sakti hai'; end if;
  if coalesce(trim(new.reason), '') = '' then raise exception 'Wajah likhna zaroori hai'; end if;
  if exists (select 1 from public.sazas where issued_by = auth.uid() and target_id = new.target_id
             and created_at > now() - interval '24 hours') then
    raise exception 'Aik din mein sirf aik Saza Card ⏳';
  end if;
  new.missed_days := private.missed_days(new.target_id, new.habit_id);
  n := coalesce(cardinality(new.missed_days), 0);
  if n = 0 then raise exception 'Is habit mein koi miss nahi mila. Saza nahi de sakte 🙅'; end if;
  if new.xp_penalty > 10 * n then raise exception 'XP cut zyada hai. Max % XP (% din miss)', 10 * n, n; end if;
  new.status := 'active'; new.proof_url := null; new.resolved_at := null;
  new.appeal_reason := null; new.appealed_at := null; new.decided_by := null;
  new.reason := left(trim(new.reason), 200);
  new.dare := nullif(trim(coalesce(new.dare, '')), '');
  new.shame_badge := nullif(trim(coalesce(new.shame_badge, '')), '');
  if new.xp_penalty = 0 and new.dare is null and new.shame_badge is null and not new.lock_rewards then
    raise exception 'Saza Card khaali hai';
  end if;
  return new;
end $$;

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
  return new;
end $$;

create or replace function private.saza_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare nstatus text := new.status; nproof text := new.proof_url; nreason text := new.appeal_reason;
begin
  if auth.uid() = old.target_id then
    if nstatus = 'submitted' then
      if old.status <> 'active' or old.dare is null then raise exception 'Not allowed'; end if;
    elsif nstatus = 'appealed' then
      if old.status <> 'active' or old.appealed_at is not null then raise exception 'Appeal sirf aik dafa ho sakti hai'; end if;
      if old.created_at < now() - interval '24 hours' then raise exception 'Appeal ka time (24 ghante) khatam ho gaya'; end if;
      if coalesce(trim(nreason), '') = '' then raise exception 'Appeal ki wajah likho'; end if;
      if not exists (select 1 from private.saza_judges(old.id)) then raise exception 'Faisla karne wala koi nahi mila'; end if;
    else
      raise exception 'Not allowed';
    end if;
  elsif old.status = 'appealed' then
    if not private.is_saza_judge(old.id) then raise exception 'Sirf judge faisla kar sakta hai'; end if;
    if nstatus not in ('active','overturned') then raise exception 'Not allowed'; end if;
  elsif private.is_partner_of(old.target_id) then
    if old.status not in ('active','submitted') then raise exception 'Ye saza pehle hi khatam ho chuki hai'; end if;
    if nstatus not in ('done','forgiven','active') then raise exception 'Not allowed'; end if;
  else
    raise exception 'Not allowed';
  end if;
  new := old;
  new.status := nstatus;
  if nstatus = 'submitted' then new.proof_url := nproof; end if;
  if nstatus = 'active' and old.status = 'submitted' then new.proof_url := null; end if;
  if nstatus = 'appealed' then new.appeal_reason := left(trim(nreason), 200); new.appealed_at := now(); end if;
  if old.status = 'appealed' then new.decided_by := auth.uid(); end if;
  new.resolved_at := case when nstatus in ('done','forgiven','overturned') then now() else null end;
  return new;
end $$;

create or replace function private.saza_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tn text := private.pname(new.target_id);
begin
  if new.status = 'submitted' then
    perform private.notify_partners(new.target_id, 'saza_submitted',
      tn || ' ne saza ka proof bheja: "' || coalesce(new.dare, '') || '". Check karo! 🧐', new.id);
  elsif new.status = 'done' then
    perform private.add_xp(new.target_id, 5, 'Saza poori ki');
    perform private.notify(new.target_id, me, 'saza_done',
      '🎉 ' || private.pname(me) || ' ne saza approve kar di. Tum azad ho! +5 XP', new.id);
  elsif new.status = 'forgiven' then
    perform private.notify(new.target_id, me, 'saza_forgiven',
      '🙏 ' || private.pname(me) || ' ne tumhe maaf kar diya. Agli baar nahi! 😤', new.id);
  elsif new.status = 'appealed' then
    insert into public.notifications (user_id, from_id, type, message, ref_id)
    select j, new.target_id, 'saza_appeal',
           '⚖️ ' || tn || ' ne ' || private.pname(new.issued_by) || ' ki saza par appeal ki: "' || new.appeal_reason || '". Faisla karo', new.id
    from private.saza_judges(new.id) j;
    perform private.notify(new.issued_by, new.target_id, 'saza_appeal_info',
      '⚖️ ' || tn || ' ne tumhari saza par appeal ki hai', new.id);
  elsif new.status = 'overturned' then
    perform private.add_xp(new.target_id, new.xp_penalty, 'Appeal jeet gaye');
    perform private.notify(new.target_id, me, 'appeal_won',
      '⚖️ ' || private.pname(me) || ' ne faisla tumhare haq mein diya! Saza cancel' ||
      case when new.xp_penalty > 0 then ', +' || new.xp_penalty || ' XP wapas' else '' end, new.id);
    perform private.notify(new.issued_by, me, 'appeal_lost',
      '⚖️ ' || private.pname(me) || ' ne ' || tn || ' ki saza cancel kar di', new.id);
  elsif new.status = 'active' and old.status = 'appealed' then
    perform private.notify(new.target_id, me, 'appeal_lost',
      '⚖️ ' || private.pname(me) || ' ka faisla: saza qaim hai', new.id);
    perform private.notify(new.issued_by, me, 'appeal_won',
      '⚖️ ' || private.pname(me) || ' ne tumhari saza qaim rakhi', new.id);
  elsif new.status = 'active' and old.status = 'submitted' then
    perform private.notify(new.target_id, me, 'saza_rejected',
      '❌ ' || private.pname(me) || ' ko proof pasand nahi aaya. Dobara karo!', new.id);
  end if;
  return new;
end $$;

drop policy "target or partner updates saza" on public.sazas;
create policy "target, partner or judge updates saza" on public.sazas for update to authenticated
  using (target_id = auth.uid() or private.is_partner_of(target_id) or private.is_saza_judge(id));

-- ---------------------------------------------------------------------
-- TODOS (private one-time tasks)
-- ---------------------------------------------------------------------
create table public.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.todos (user_id, created_at);
alter table public.todos enable row level security;
create policy "my todos" on public.todos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- LEADERBOARD: this week only (focused groups count only group tasks)
-- ---------------------------------------------------------------------
drop function public.leaderboard(uuid);
create or replace function public.leaderboard(p_group uuid)
returns table (user_id uuid, display_name text, avatar text, title text, xp int, weekly_xp int, done_week int)
language sql stable security definer set search_path = public as $$
  with g as (select kind from public.groups where id = p_group)
  select p.id, p.display_name, p.avatar, p.title, p.xp,
    (case when (select kind from g) = 'focused' then
       coalesce((select sum(c.xp_awarded) from public.checkins c join public.habits h on h.id = c.habit_id
                 where c.user_id = p.id and h.group_id = p_group and c.status = 'done'
                   and c.created_at > now() - interval '7 days'), 0)
     else
       coalesce((select sum(e.amount) from public.xp_events e
                 where e.user_id = p.id and e.created_at > now() - interval '7 days'), 0)
     end)::int,
    (select count(*) from public.checkins c join public.habits h on h.id = c.habit_id
      where c.user_id = p.id and c.status = 'done' and c.day > private.local_today() - 7
        and (h.group_id = p_group or ((select kind from g) = 'general' and h.group_id is null)))::int
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group and private.is_group_member(p_group)
  order by 6 desc;
$$;

-- ---------------------------------------------------------------------
-- PUSH NOTIFICATIONS
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "see my devices" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "remove my devices" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not logged in'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Bad endpoint'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, left(p_p256dh, 200), left(p_auth, 100), left(p_ua, 300));
  delete from public.push_subscriptions where user_id = auth.uid() and id not in
    (select id from public.push_subscriptions where user_id = auth.uid() order by created_at desc limit 8);
end $$;

-- sends a batch [{subs:[...], payload:{...}}] to the push edge function; never breaks the app
create or replace function private.push_batch(batch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  if batch is null or jsonb_array_length(batch) = 0 then return; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'pakka_push_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'pakka_push_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('batch', batch),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'push failed: %', sqlerrm;
end $$;

create or replace function private.push_to(user_ids uuid[], payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare subs jsonb;
begin
  if user_ids is null or cardinality(user_ids) = 0 then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)))
    into subs from public.push_subscriptions s where s.user_id = any(user_ids);
  if subs is null then return; end if;
  perform private.push_batch(jsonb_build_array(jsonb_build_object('subs', subs, 'payload', payload)));
end $$;

create or replace function private.notification_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare ttl text; url text;
begin
  ttl := case new.type
    when 'poke' then '👉 Poke' when 'cheer' then '🎉 Cheer'
    when 'saza' then '😈 Saza Card' when 'saza_submitted' then '🧐 Saza proof'
    when 'saza_done' then '🎉 Saza khatam' when 'saza_forgiven' then '🙏 Maafi'
    when 'saza_rejected' then '❌ Proof reject' when 'saza_appeal' then '⚖️ Appeal'
    when 'saza_appeal_info' then '⚖️ Appeal' when 'appeal_won' then '⚖️ Faisla' when 'appeal_lost' then '⚖️ Faisla'
    when 'approval_needed' then '🧐 Approve karo' when 'approved' then '✅ Approved' when 'rejected' then '❌ Rejected'
    when 'partner_request' then '🤝 Partner request' when 'partner_accepted' then '🤝 Naya partner'
    when 'partner_released' then '🕊️ Partnership khatam'
    when 'join_request' then '🙋 Join request' when 'join_approved' then '🎉 Group joined'
    when 'join_declined' then 'Join request' when 'removed' then 'Group'
    else 'Pakka' end;
  url := case
    when new.type in ('approval_needed','saza_submitted','partner_request','saza_appeal') then '/?go=partners'
    when new.type in ('join_request','join_approved') then '/?go=group&id=' || new.ref_id
    else '/?go=home' end;
  perform private.push_to(array[new.user_id],
    jsonb_build_object('title', ttl, 'body', new.message, 'url', url, 'tag', 'n' || new.id));
  return new;
end $$;
create trigger notification_push after insert on public.notifications
  for each row execute function private.notification_push();

create or replace function private.message_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare g public.groups; ids uuid[]; body text;
begin
  if new.kind = 'system' then return new; end if;
  select * into g from public.groups where id = new.group_id;
  select array_agg(gm.user_id) into ids from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = new.group_id and gm.user_id <> new.user_id and p.push_chat and gm.joined_at <= new.created_at;
  body := private.pname(new.user_id) || ': ' ||
          case when new.kind = 'sticker' then 'Sticker 🎨' else left(new.content, 140) end;
  perform private.push_to(ids, jsonb_build_object('title', g.emoji || ' ' || g.name, 'body', body,
    'url', '/?go=group&id=' || g.id, 'tag', 'g' || g.id));
  return new;
end $$;
create trigger message_push after insert on public.messages
  for each row execute function private.message_push();

-- 9 PM reminder for people with habits left today
create or replace function private.send_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare t date := private.local_today(); dw int := extract(dow from private.local_today())::int; batch jsonb;
begin
  with u as (
    select p.id from public.profiles p
    where p.push_reminder and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  ), hab as (
    select u.id as uid, h.id as hid from u join public.habits h on not h.archived and dw = any(h.days)
      and ((h.group_id is null and h.user_id = u.id)
        or (h.group_id is not null and exists (select 1 from public.group_members gm
                                               where gm.group_id = h.group_id and gm.user_id = u.id)))
  ), lft as (
    select uid, count(*) as n from hab
    where not exists (select 1 from public.checkins c where c.habit_id = hab.hid and c.user_id = hab.uid
                      and c.day = t and c.status in ('done','pending'))
    group by uid
  )
  select jsonb_agg(jsonb_build_object(
      'subs', (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint,
                 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)))
               from public.push_subscriptions s where s.user_id = lft.uid),
      'payload', jsonb_build_object('title', '⏰ Pakka reminder',
                 'body', 'Aaj ke ' || lft.n || case when lft.n = 1 then ' habit baqi hai' else ' habits baqi hain' end || '. Abhi karo! 💪',
                 'url', '/?go=home', 'tag', 'reminder')))
    into batch from lft where lft.n > 0;
  perform private.push_batch(batch);
end $$;

-- ---------------------------------------------------------------------
-- PERMISSIONS
-- ---------------------------------------------------------------------
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_group_member(uuid), private.can_see(uuid), private.is_partner_of(uuid), private.is_locked(uuid),
  private.is_group_admin(uuid), private.has_join_request(uuid), private.can_read_msg(uuid, timestamptz),
  private.can_read_msg_id(bigint), private.can_see_habit(uuid, uuid), private.can_see_checkin(uuid, uuid),
  private.is_saza_judge(uuid)
  to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_group(text, text, text), public.join_group(text), public.respond_join(uuid, uuid, boolean),
  public.remove_member(uuid, uuid), public.leaderboard(uuid), public.habits_for(uuid),
  public.saza_options(uuid), public.save_push_subscription(text, text, text, text)
  to authenticated;

revoke all on all tables in schema public from anon;
revoke insert, update on public.join_requests from authenticated;
grant select, delete on public.join_requests to authenticated;
revoke insert, update on public.push_subscriptions from authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.todos, public.message_reactions to authenticated;

alter publication supabase_realtime add table
  public.message_reactions, public.join_requests, public.group_members;
