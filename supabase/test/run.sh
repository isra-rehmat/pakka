#!/bin/bash
# usage: ./run.sh  -> fresh DB, v1 schema + v1 scenarios, then v2 migration + v2 scenarios
set -e
P="psql -h /tmp -p 5499 -U postgres"
$P -q -c "drop database if exists t" -c "create database t"
$P -d t -q -v ON_ERROR_STOP=1 -f stubs.sql >/dev/null 2>&1 || true
$P -d t -q -v ON_ERROR_STOP=1 -f stubs_v2.sql
$P -d t -q -v ON_ERROR_STOP=1 -f ../migrations/001_init.sql
$P -d t -q -f scenarios.sql > /tmp/v1.out 2>&1
grep -v "pg_net" ../migrations/002_v2.sql > /tmp/002_local.sql
$P -d t -q -v ON_ERROR_STOP=1 -f /tmp/002_local.sql && echo "V2 MIGRATION OK"
if [ -f scenarios_v2.sql ]; then $P -d t -f scenarios_v2.sql 2>&1; fi
# hardening check (endpoint allowlist) - pg_net lines skipped locally
grep -v "pg_net" ../migrations/004_hardening.sql > /tmp/004_local.sql
$P -d t -q -v ON_ERROR_STOP=1 -f /tmp/004_local.sql && echo "004 OK"
$P -d t -q <<'SQL'
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false); set role authenticated;
select expect_fail($q$select save_push_subscription('https://evil.example.com/x', 'a', 'b')$q$) as evil_endpoint;
select save_push_subscription('https://fcm.googleapis.com/fcm/send/ok1', 'a', 'b') is null as fcm_ok;
select save_push_subscription('https://web.push.apple.com/abc', 'a', 'b') is null as apple_ok;
SQL
