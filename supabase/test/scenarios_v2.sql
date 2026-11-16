\set ON_ERROR_STOP 0
\pset footer off
\set A '\'aaaaaaaa-0000-0000-0000-000000000001\''
\set B '\'bbbbbbbb-0000-0000-0000-000000000002\''
\set C '\'cccccccc-0000-0000-0000-000000000003\''
\set D '\'dddddddd-0000-0000-0000-000000000004\''
insert into auth.users values (:D, 'sana@x.com', '{"full_name":"Sana"}');

create or replace function public.t(label text, ok boolean) returns text language sql as $$ select case when ok then 'PASS ' else 'FAIL ' end || label $$;
grant execute on function public.t(text, boolean) to authenticated;

\echo '== announcements cleaned'
select t('only group notes left in chat', not exists (select 1 from messages where kind='system' and content ~ '^(✅|😈|😇|🏅|🤝)'));

set session_replication_role = replica; update sazas set created_at = now() - interval '3 days'; set session_replication_role = origin;
select invite_code as fam from groups where name='Family' \gset
\echo '== join requests'
select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
select t('C join -> requested', (join_group(:'fam')->>'status') = 'requested');
select t('C not a member yet', not exists (select 1 from group_members where user_id = auth.uid()));
select t('C sees pending group name', exists (select 1 from groups where name='Family'));
select t('C reads no chat', (select count(*) from messages) = 0);
select expect_fail($q$select respond_join((select id from groups where name='Family'), auth.uid(), true)$q$);
reset role;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
insert into messages (group_id, user_id, content) values ((select id from groups where name='Family'), auth.uid(), 'old message before C');
select expect_fail($q$select respond_join((select id from groups where name='Family'), 'cccccccc-0000-0000-0000-000000000003', true)$q$) as b_not_admin;
reset role;
select pg_sleep(0.05);
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select t('A got join_request notif', exists (select 1 from notifications where user_id = auth.uid() and type='join_request'));
select t('A sees requester profile', exists (select 1 from profiles where id = 'cccccccc-0000-0000-0000-000000000003'));
select respond_join((select id from groups where name='Family'), 'cccccccc-0000-0000-0000-000000000003', true);
reset role;
select pg_sleep(0.05);
select id as oldmsg from messages where content = 'old message before C' \gset
select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
select t('C now member', exists (select 1 from group_members where user_id = auth.uid()));
select t('C cannot see old messages', not exists (select 1 from messages where content = 'old message before C'));
select t('C sees own join note', exists (select 1 from messages where content like '%join kar liya%'));
insert into messages (group_id, user_id, content) values ((select id from groups where name='Family'), auth.uid(), 'hi from C');
select expect_fail(format($q$insert into message_reactions (message_id, user_id, emoji) values (%s, auth.uid(), '😂')$q$, :oldmsg)) as c_react_old;
reset role;

\echo '== focused group + group tasks'
select set_config('request.jwt.claim.sub', :D, false); set role authenticated;
select join_group(:'fam');
reset role;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select respond_join((select id from groups where name='Family'), 'dddddddd-0000-0000-0000-000000000004', true);
select name, kind from create_group('Gym Bros', '💪', 'focused');
reset role;
select invite_code as gym from groups where name='Gym Bros' \gset
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into habits (user_id, group_id, title, emoji) values (auth.uid(), (select id from groups where name='Gym Bros'), 'Gym Group', '🏋️');
reset role;
select set_config('request.jwt.claim.sub', :D, false); set role authenticated;
select join_group(:'gym');
insert into habits (user_id, title, emoji) values (auth.uid(), 'Sana secret habit', '🤫');
reset role;
select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
select join_group(:'gym');
reset role;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select respond_join(g.id, r.user_id, true) from join_requests r join groups g on g.id = r.group_id where g.name = 'Gym Bros';
reset role;
-- C leaves Family so C only shares the focused group with D
select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
delete from group_members where user_id = auth.uid() and group_id = (select id from groups where name='Family');
select t('C sees Gym task', exists (select 1 from habits where title='Gym Group'));
select t('C cannot see D personal habit (focused)', not exists (select 1 from habits where title='Sana secret habit'));
select t('habits_for(D) as C = only Gym', (select array_agg(title) from habits_for('dddddddd-0000-0000-0000-000000000004')) = array['Gym Group']);
select expect_fail($q$insert into habits (user_id, group_id, title) values (auth.uid(), (select id from groups where name='Gym Bros'), 'C task')$q$) as c_not_admin_task;
update habits set title = 'hacked' where title = 'Gym Group';
select t('non-admin cannot edit group task', exists (select 1 from habits where title='Gym Group'));
insert into checkins (habit_id, user_id, day) select id, auth.uid(), current_date from habits where title='Gym Group';
reset role;
select set_config('request.jwt.claim.sub', :D, false); set role authenticated;
insert into checkins (habit_id, user_id, day) select id, auth.uid(), current_date from habits where title='Gym Group';
insert into checkins (habit_id, user_id, day) select id, auth.uid(), current_date from habits where title='Sana secret habit';
select t('D sees C Gym check-in', exists (select 1 from checkins c join habits h on h.id=c.habit_id where h.title='Gym Group' and c.user_id='cccccccc-0000-0000-0000-000000000003'));
reset role;
select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
select t('C cannot see D personal check-in', not exists (select 1 from checkins c where c.user_id='dddddddd-0000-0000-0000-000000000004' and c.habit_id = (select id from habits where title='Sana secret habit')));
select t('C chat: no check-in announcements', not exists (select 1 from messages where content like '%complete kiya%'));
select t('focused leaderboard: only group task XP', (select weekly_xp from leaderboard((select id from groups where name='Gym Bros')) where user_id='dddddddd-0000-0000-0000-000000000004') = 10);
reset role;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select t('A (general Family with D) sees D personal habit', exists (select 1 from habits where title='Sana secret habit'));
select expect_fail($q$select remove_member((select id from groups where name='Gym Bros'), auth.uid())$q$) as remove_self;
reset role;

\echo '== fair saza'
-- B becomes A's partner; A's Water habit is 10 days old with no check-ins in the last week except today
update habits set created_at = now() - interval '10 days' where title = 'Water';
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into partnerships (user_id, partner_id) values (auth.uid(), 'bbbbbbbb-0000-0000-0000-000000000002');
reset role;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
update partnerships set status = 'active' where partner_id = auth.uid();
select (saza_options('aaaaaaaa-0000-0000-0000-000000000001')::jsonb -> 'habits') as options;
select expect_fail($q$insert into sazas (target_id, xp_penalty, reason) values ('aaaaaaaa-0000-0000-0000-000000000001', 10, 'no habit')$q$) as no_habit;
select expect_fail($q$insert into sazas (target_id, habit_id, xp_penalty) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 10 from habits where title='Water'$q$) as no_reason;
select expect_fail($q$insert into sazas (target_id, habit_id, xp_penalty, reason) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 10, 'x' from habits where title='Read'$q$) as habit_no_miss;
select expect_fail($q$insert into sazas (target_id, habit_id, xp_penalty, reason) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 500, 'too much' from habits where title='Water'$q$) as too_much_xp;
select xp as a_xp_before from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into sazas (target_id, habit_id, xp_penalty, reason, shame_badge, lock_rewards) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 30, 'Paani nahi piya', '🐢 Kal Karunga', true from habits where title='Water';
select t('saza covers 7 days', (select cardinality(missed_days) from sazas where reason='Paani nahi piya') = 7);
select expect_fail($q$insert into sazas (target_id, habit_id, xp_penalty, reason) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 10, 'again' from habits where title='Read'$q$) as daily_limit;
reset role;
set session_replication_role = replica; update sazas set created_at = now() - interval '25 hours' where reason = 'Paani nahi piya'; set session_replication_role = origin;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
select expect_fail($q$insert into sazas (target_id, habit_id, xp_penalty, reason) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 10, 'same days again' from habits where title='Water'$q$) as same_days_twice;
reset role;
set session_replication_role = replica; update sazas set created_at = now() - interval '2 hours' where reason = 'Paani nahi piya'; set session_replication_role = origin;

\echo '== appeal'
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select t('A locked', exists (select 1 from sazas where target_id = auth.uid() and lock_rewards and status='active'));
select expect_fail($q$update sazas set status='appealed' where reason='Paani nahi piya'$q$) as appeal_no_reason;
update sazas set status='appealed', appeal_reason='Main bimar tha' where reason='Paani nahi piya';
select t('appealed', (select status from sazas where reason='Paani nahi piya') = 'appealed');
reset role;
select private.is_locked('aaaaaaaa-0000-0000-0000-000000000001') as locked_during_appeal;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
update sazas set status='active' where reason='Paani nahi piya';
select t('issuer cannot judge', (select status from sazas where reason='Paani nahi piya') = 'appealed');
reset role;
select set_config('request.jwt.claim.sub', :D, false); set role authenticated;
select t('D got appeal notification', exists (select 1 from notifications where user_id = auth.uid() and type='saza_appeal'));
update sazas set status='overturned' where reason='Paani nahi piya';
reset role;
select t('overturned + XP back', (select status from sazas where reason='Paani nahi piya') = 'overturned');
select xp as a_xp_after from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select expect_fail($q$update sazas set status='appealed', appeal_reason='again' where reason='Paani nahi piya'$q$) as appeal_twice;
reset role;

\echo '== todos, profile, push'
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into todos (title) values ('Bijli ka bill');
update profiles set bio = 'Video editor 🎬' where id = auth.uid();
select save_push_subscription('https://fcm.googleapis.com/fcm/send/abc', 'p256', 'authkey', 'test');
select expect_fail($q$update profiles set xp = 99999 where id = auth.uid()$q$) as xp_cheat;
select expect_fail($q$select private.add_xp(auth.uid(), 1000, 'cheat')$q$) as call_private;
select expect_fail($q$select private.send_reminders()$q$) as call_reminders;
reset role;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
select t('B cannot see A todos', (select count(*) from todos) = 0);
select t('B cannot see A devices', (select count(*) from push_subscriptions) = 0);
reset role;
delete from net.calls;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
insert into notifications (user_id, from_id, type, message) values ('aaaaaaaa-0000-0000-0000-000000000001', auth.uid(), 'poke', 'Oye!');
insert into messages (group_id, user_id, content) values ((select id from groups where name='Family'), auth.uid(), 'khana tayyar hai');
reset role;
select t('push sent for poke + chat', (select count(*) from net.calls) = 2);
select body->'batch'->0->'payload'->>'title' as title, body->'batch'->0->'payload'->>'body' as body, headers->>'x-push-secret' as secret from net.calls order by id;
delete from net.calls;
select private.send_reminders();
select body->'batch'->0->'payload'->>'body' as reminder from net.calls;

\echo '== leaving keeps an admin'
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
delete from group_members where user_id = auth.uid() and group_id = (select id from groups where name='Gym Bros');
reset role;
select t('someone promoted to admin', exists (select 1 from group_members gm join groups g on g.id=gm.group_id where g.name='Gym Bros' and gm.role='admin'));
