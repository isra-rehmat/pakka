\set ON_ERROR_STOP 1
\set A '\'aaaaaaaa-0000-0000-0000-000000000001\''
\set B '\'bbbbbbbb-0000-0000-0000-000000000002\''
\set C '\'cccccccc-0000-0000-0000-000000000003\''
insert into auth.users values (:A,'okasha@x.com','{"full_name":"Okasha"}'),(:B,'ammi@x.com','{"name":"Ammi"}'),(:C,'stranger@x.com','{}');
select id, display_name from profiles order by display_name;

-- expect-failure helper
create or replace function public.expect_fail(q text) returns text language plpgsql as $$
begin execute q; return 'UNEXPECTED SUCCESS: ' || q;
exception when others then return 'ok (blocked): ' || sqlerrm; end $$;
grant execute on function public.expect_fail(text) to authenticated;

-- ===== A creates group =====
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select name, invite_code from create_group('Family', '🏠') \gset g_
select :'g_invite_code' as code;
insert into habits (user_id, title, emoji, proof) values (:A,'Gym','💪','none'), (:A,'Read','📚','approval') ;
select title, proof, xp from habits order by title;
select expect_fail($q$update profiles set xp = 9999 where id = auth.uid()$q$);
select expect_fail($q$insert into xp_events(user_id,amount,reason) values (auth.uid(),100,'cheat')$q$);
insert into checkins (habit_id, user_id, day) select id, :A, current_date from habits where title='Gym';
select xp from profiles where id = :A;  -- expect 10
select expect_fail($q$insert into checkins (habit_id, user_id, day) select id, auth.uid(), current_date from habits where title='Read'$q$); -- needs photo
reset role;

-- ===== C (stranger) can't see A =====
select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
select count(*) as c_sees_profiles from profiles;  -- expect 1 (self)
select count(*) as c_sees_habits from habits;      -- expect 0
select expect_fail($q$select join_group('ZZZZZZ')$q$);
select expect_fail($q$insert into notifications(user_id, from_id, type, message) values ('aaaaaaaa-0000-0000-0000-000000000001', auth.uid(), 'poke', 'hi')$q$);
reset role;

-- ===== B joins, A asks B to be partner =====
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
select name from join_group(lower(:'g_invite_code'));
select count(*) as b_sees_habits from habits;  -- expect 2
reset role;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into partnerships (user_id, partner_id) values (:A, :B);
select expect_fail($q$update partnerships set status='active'$q$) as a_self_accept;  -- should not affect (0 rows) -> shows unexpected success but check status next
select status from partnerships;
reset role;
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
select type, message from notifications where user_id = auth.uid();
update partnerships set status = 'active' where partner_id = auth.uid();
select status from partnerships;
reset role;

-- ===== A checks in Read with proof (pending) =====
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
insert into checkins (habit_id, user_id, day, proof_url) select id, :A, current_date, 'http://x/p.jpg' from habits where title='Read';
select h.title, c.status, c.xp_awarded from checkins c join habits h on h.id=c.habit_id order by h.title;
update checkins set status='done' where status='pending'; -- RLS: A not partner -> 0 rows
select status from checkins where status='pending';
delete from partnerships; -- A cannot fire partner -> 0 rows
select count(*) as partnerships_still from partnerships;
reset role;

-- ===== B approves, then gives Saza =====
select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
select type from notifications where user_id = auth.uid() order by id;
update checkins set status='done' where status='pending';
select xp from profiles where id = :A; -- expect 30
insert into sazas (target_id, xp_penalty, dare, shame_badge, lock_rewards, reason) values (:A, 20, '20 pushups', '🐌 Sust Insaan', true, 'Missed gym');
select xp from profiles where id = :A; -- expect 10
insert into notifications(user_id, from_id, type, message) values (:A, :B, 'poke', 'Oye!');
reset role;

-- ===== A is locked =====
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select expect_fail($q$update profiles set avatar='🦁' where id = auth.uid()$q$);
update profiles set display_name='Okasha A' where id = auth.uid();
insert into habits (user_id, title, emoji) values (:A,'Water','💧');
insert into checkins (habit_id, user_id, day) select id, :A, current_date from habits where title='Water';
select xp_awarded from checkins c join habits h on h.id=c.habit_id where h.title='Water'; -- expect 0
select expect_fail($q$update sazas set status='done'$q$);
update sazas set status='submitted', proof_url='http://x/d.jpg';
select status from sazas;
reset role;

select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
update sazas set status='done';
select status, resolved_at is not null as resolved from sazas;
select xp from profiles where id = :A; -- expect 15
reset role;

select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
update profiles set avatar='🦁' where id = auth.uid();
select avatar from profiles where id = auth.uid();
insert into achievements (user_id, code, name) values (:A, 'first_checkin', 'Pehla Qadam');
select * from leaderboard((select id from groups limit 1));
delete from checkins where habit_id = (select id from habits where title='Gym');
select xp from profiles where id = auth.uid(); -- 15+25-10 = 30
select type, left(message,60) msg from notifications where user_id = auth.uid() order by id;
select left(content,80) from messages order by id;
reset role;

select set_config('request.jwt.claim.sub', :C, false); set role authenticated;
select count(*) as c_sees_messages from messages; -- 0
reset role;

select set_config('request.jwt.claim.sub', :B, false); set role authenticated;
delete from partnerships where partner_id = auth.uid();
select count(*) as after_release from partnerships;
reset role;
