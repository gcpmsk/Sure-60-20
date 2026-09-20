-- SURE60: run this ENTIRE file in Supabase SQL Editor (new or existing project).
-- No passwords, privileged API keys or client-readable answer keys are stored here.
begin;
create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z0-9_.-]{3,50}$'),
 full_name text not null check (length(full_name) between 1 and 100),
 role text not null default 'student' check (role in ('student','admin')),
 verified boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.site_settings (
 id integer primary key check (id=1), data jsonb not null default '{}'::jsonb
);
insert into public.site_settings(id,data) values(1,'{}') on conflict(id) do nothing;
create table if not exists public.batches (
 id uuid primary key default gen_random_uuid(), title text not null,
 subtitle text default '', category text default 'SSC', duration text default '',
 price text default '', subjects text default '', mode text default 'Recorded',
 tag text default 'ENROLLMENT OPEN', color text default 'mint', image_url text default '',
 created_at timestamptz not null default now()
);
create table if not exists public.enrollments (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id) on delete cascade,
 batch_id uuid not null references public.batches(id) on delete cascade,
 created_at timestamptz not null default now(), unique(student_id,batch_id)
);
create table if not exists public.lessons (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.batches(id) on delete cascade,
 title text not null, subject text not null, topic text default '',
 video_url text not null, pdf_url text default '', duration text default '',
 position integer not null default 1, created_at timestamptz not null default now()
);
create table if not exists public.tests (
 id uuid primary key default gen_random_uuid(), title text not null,
 description text default '', category text default 'SSC',
 batch_id uuid references public.batches(id) on delete cascade,
 duration_minutes integer not null check(duration_minutes between 1 and 240),
 marks numeric not null default 1 check(marks>0 and marks<=100),
 negative_marks numeric not null default 0 check(negative_marks>=0 and negative_marks<=100),
 question_count integer not null default 0 check(question_count between 0 and 500),
 published boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.questions (
 id uuid primary key default gen_random_uuid(),
 test_id uuid not null references public.tests(id) on delete cascade,
 position integer not null, body text not null check(length(body)>0),
 options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options)=4),
 unique(test_id,position)
);
create table if not exists private.answer_keys (
 question_id uuid primary key references public.questions(id) on delete cascade,
 correct_option integer not null check(correct_option between 0 and 3)
);
create table if not exists public.attempts (
 id uuid primary key default gen_random_uuid(),
 test_id uuid not null references public.tests(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 started_at timestamptz not null default now(), deadline timestamptz not null,
 answers jsonb not null default '{}'::jsonb,
 submitted_at timestamptz, correct integer, wrong integer, unanswered integer, score numeric,
 unique(test_id,student_id)
);
create index if not exists lessons_batch_idx on public.lessons(batch_id,subject);
create index if not exists attempts_deadline_idx on public.attempts(deadline) where submitted_at is null;
create index if not exists attempts_rank_idx on public.attempts(test_id,score desc);
create index if not exists enrollments_batch_idx on public.enrollments(batch_id);
create index if not exists questions_test_idx on public.questions(test_id);

-- Never derive privileges from sign-up metadata. Only SQL-owner actions grant admin.
create or replace function private.create_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_username text;
begin
 v_username := lower(coalesce(nullif(new.raw_user_meta_data->>'username',''),'user_'||replace(new.id::text,'-','')));
 if v_username !~ '^[a-z0-9_.-]{3,50}$' then raise exception 'Invalid roll number / username'; end if;
 insert into public.profiles(id,username,full_name,role,verified)
 values(new.id,v_username,left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'Sure60 student'),100),'student',false);
 return new;
end $$;
drop trigger if exists sure60_create_profile on auth.users;
create trigger sure60_create_profile after insert on auth.users for each row execute function private.create_profile();

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and verified);
$$;
create or replace function private.is_verified() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and verified);
$$;
create or replace function private.can_access_batch(p_batch uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_admin() or (private.is_verified() and exists(select 1 from public.enrollments where student_id=auth.uid() and batch_id=p_batch));
$$;
create or replace function private.can_access_test(p_test uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_admin() or (private.is_verified() and exists(select 1 from public.tests t where t.id=p_test and t.published and (t.batch_id is null or private.can_access_batch(t.batch_id))));
$$;

alter table public.profiles enable row level security;
alter table public.site_settings enable row level security;
alter table public.batches enable row level security;
alter table public.enrollments enable row level security;
alter table public.lessons enable row level security;
alter table public.tests enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table private.answer_keys enable row level security;

-- Drop only Sure60 policies, making this setup safely repeatable.
drop policy if exists sure60_profiles_read on public.profiles;
create policy sure60_profiles_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
drop policy if exists sure60_settings_read on public.site_settings;
create policy sure60_settings_read on public.site_settings for select to anon,authenticated using(true);
drop policy if exists sure60_settings_admin on public.site_settings;
create policy sure60_settings_admin on public.site_settings for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists sure60_batches_read on public.batches;
create policy sure60_batches_read on public.batches for select to anon,authenticated using(true);
drop policy if exists sure60_batches_admin on public.batches;
create policy sure60_batches_admin on public.batches for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists sure60_enrollment_read on public.enrollments;
create policy sure60_enrollment_read on public.enrollments for select to authenticated using((student_id=auth.uid() and private.is_verified()) or private.is_admin());
drop policy if exists sure60_enrollment_admin on public.enrollments;
create policy sure60_enrollment_admin on public.enrollments for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists sure60_lessons_read on public.lessons;
create policy sure60_lessons_read on public.lessons for select to authenticated using(private.can_access_batch(batch_id));
drop policy if exists sure60_lessons_admin on public.lessons;
create policy sure60_lessons_admin on public.lessons for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists sure60_tests_read on public.tests;
create policy sure60_tests_read on public.tests for select to anon,authenticated using(published or private.is_admin());
drop policy if exists sure60_tests_admin on public.tests;
create policy sure60_tests_admin on public.tests for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists sure60_questions_read on public.questions;
create policy sure60_questions_read on public.questions for select to authenticated using(private.is_admin() or (private.can_access_test(test_id) and exists(select 1 from public.attempts a where a.test_id=questions.test_id and a.student_id=auth.uid())));
drop policy if exists sure60_attempts_read on public.attempts;
create policy sure60_attempts_read on public.attempts for select to authenticated using(private.is_admin() or (student_id=auth.uid() and private.is_verified()));

-- Grants are deliberately narrow; mutations of profiles/questions/attempts use RPC only.
revoke all on public.profiles,public.site_settings,public.batches,public.enrollments,public.lessons,public.tests,public.questions,public.attempts from anon,authenticated;
grant select on public.site_settings,public.batches,public.tests to anon;
grant select on public.profiles,public.site_settings,public.batches,public.enrollments,public.lessons,public.tests,public.questions,public.attempts to authenticated;
grant insert,update,delete on public.site_settings,public.batches,public.enrollments,public.lessons,public.tests to authenticated;
revoke all on private.answer_keys from public,anon,authenticated;

create or replace function public.admin_update_student(p_id uuid,p_verified boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator access required'; end if;
 update public.profiles set verified=p_verified where id=p_id and role='student';
 if not found then raise exception 'Student not found'; end if;
end $$;

-- One transaction publishes questions AND private answers, avoiding partially ready tests.
create or replace function public.admin_create_test(p_meta jsonb,p_questions jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_test uuid; v_qid uuid; q jsonb; n integer:=0;
begin
 if not private.is_admin() then raise exception 'Administrator access required'; end if;
 if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'Questions must be an array'; end if;
 if jsonb_array_length(p_questions) not between 1 and 500 then raise exception 'Use 1 to 500 questions'; end if;
 if coalesce(length(trim(p_meta->>'title')),0)=0 then raise exception 'Test title required'; end if;
 insert into public.tests(title,description,category,batch_id,duration_minutes,marks,negative_marks,question_count,published)
 values(p_meta->>'title',coalesce(p_meta->>'description',''),coalesce(p_meta->>'category','SSC'),nullif(p_meta->>'batch_id','')::uuid,(p_meta->>'duration_minutes')::integer,(p_meta->>'marks')::numeric,(p_meta->>'negative_marks')::numeric,jsonb_array_length(p_questions),true) returning id into v_test;
 for q in select value from jsonb_array_elements(p_questions) loop
  n:=n+1;
  if coalesce(length(trim(q->>'body')),0)=0 or jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Invalid question %',n; end if;
  if jsonb_array_length(q->'options')<>4 or exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o)<>'string' or length(trim(o#>>'{}'))=0) then raise exception 'Question % needs four non-empty options',n; end if;
  if (q->>'answer') is null or (q->>'answer') !~ '^[0-3]$' then raise exception 'Missing answer for question %',n; end if;
  insert into public.questions(test_id,position,body,options) values(v_test,n,q->>'body',q->'options') returning id into v_qid;
  insert into private.answer_keys(question_id,correct_option) values(v_qid,(q->>'answer')::integer);
 end loop;
 return v_test;
end $$;

create or replace function private.validate_answers(p_test uuid,p_answers jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text)>100000 then raise exception 'Invalid answer payload'; end if;
 if exists(select 1 from jsonb_each(p_answers) x where jsonb_typeof(x.value)<>'number' or x.value::text !~ '^[0-3]$' or not exists(select 1 from public.questions q where q.test_id=p_test and q.id::text=x.key)) then raise exception 'Invalid answer or question'; end if;
end $$;
create or replace function private.finalize_attempt(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attempts; t public.tests; v_correct integer; v_wrong integer; v_unanswered integer;
begin
 select * into a from public.attempts where id=p_attempt for update;
 if not found then raise exception 'Attempt not found'; end if;
 if a.submitted_at is not null then return to_jsonb(a)-'answers'; end if;
 select * into t from public.tests where id=a.test_id;
 select count(*) filter(where (a.answers->>q.id::text)::integer=k.correct_option),
        count(*) filter(where a.answers ? q.id::text and (a.answers->>q.id::text)::integer<>k.correct_option),
        count(*) filter(where not (a.answers ? q.id::text))
 into v_correct,v_wrong,v_unanswered from public.questions q join private.answer_keys k on k.question_id=q.id where q.test_id=a.test_id;
 update public.attempts set correct=v_correct,wrong=v_wrong,unanswered=v_unanswered,
 score=v_correct*t.marks-v_wrong*t.negative_marks,submitted_at=least(clock_timestamp(),deadline)
 where id=a.id returning * into a;
 return to_jsonb(a)-'answers';
end $$;
create or replace function public.start_test(p_test uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attempts; t public.tests;
begin
 if not private.can_access_test(p_test) then raise exception 'Verified account and batch access required'; end if;
 select * into t from public.tests where id=p_test;
 if t.question_count<1 then raise exception 'This test has no questions'; end if;
 insert into public.attempts(test_id,student_id,deadline) values(p_test,auth.uid(),clock_timestamp()+make_interval(mins=>t.duration_minutes)) on conflict(test_id,student_id) do nothing;
 select * into a from public.attempts where test_id=p_test and student_id=auth.uid() for update;
 if a.submitted_at is null and a.deadline<=clock_timestamp() then perform private.finalize_attempt(a.id); select * into a from public.attempts where id=a.id; end if;
 return to_jsonb(a);
end $$;
create or replace function public.save_test_answers(p_attempt uuid,p_answers jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.attempts;
begin
 select * into a from public.attempts where id=p_attempt and student_id=auth.uid() for update;
 if not found or not private.can_access_test(a.test_id) then raise exception 'Attempt access denied'; end if;
 if a.submitted_at is not null or clock_timestamp()>=a.deadline then raise exception 'Test time is over'; end if;
 perform private.validate_answers(a.test_id,p_answers);
 update public.attempts set answers=p_answers where id=a.id;
end $$;
create or replace function public.submit_test(p_attempt uuid,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.attempts;
begin
 select * into a from public.attempts where id=p_attempt and student_id=auth.uid() for update;
 if not found or not private.is_verified() then raise exception 'Attempt access denied'; end if;
 if a.submitted_at is not null then return to_jsonb(a)-'answers'; end if;
 -- After expiry, ONLY answers already saved before the deadline are graded.
 if clock_timestamp()<a.deadline then
  perform private.validate_answers(a.test_id,p_answers);
  update public.attempts set answers=p_answers where id=a.id;
 end if;
 return private.finalize_attempt(a.id);
end $$;
create or replace function private.expire_attempts() returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 for r in select id from public.attempts where submitted_at is null and deadline<=clock_timestamp() for update skip locked loop
  perform private.finalize_attempt(r.id);
 end loop;
end $$;
create or replace function public.get_leaderboard(p_test uuid)
returns table(rank bigint,student_id uuid,full_name text,username text,correct integer,wrong integer,unanswered integer,score numeric,submitted_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if not private.can_access_test(p_test) then raise exception 'Sign in with a verified account and the required batch access to view rankings'; end if;
 -- Also finalizes expired attempts on read if cron is unavailable.
 for r in select a.id from public.attempts a where a.test_id=p_test and a.submitted_at is null and a.deadline<=clock_timestamp() for update skip locked loop perform private.finalize_attempt(r.id); end loop;
 return query select row_number() over(order by a.score desc,a.wrong asc,(a.submitted_at-a.started_at) asc,a.id asc),a.student_id,p.full_name,p.username,a.correct,a.wrong,a.unanswered,a.score,a.submitted_at
 from public.attempts a join public.profiles p on p.id=a.student_id
 where a.test_id=p_test and a.submitted_at is not null and p.verified
 order by a.score desc,a.wrong asc,(a.submitted_at-a.started_at) asc,a.id asc;
end $$;

-- Explicit batch -> subjects -> ordered classes, including safe legacy migration.
create table if not exists public.subjects (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.batches(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 position integer not null default 1 check(position>0),
 minimum_classes integer not null default 5 check(minimum_classes in (4,5)),
 created_at timestamptz not null default now(), unique(id,batch_id)
);
create unique index if not exists subjects_batch_name_idx on public.subjects(batch_id,lower(trim(name)));
alter table public.lessons add column if not exists subject_id uuid;
alter table public.lessons add column if not exists published boolean not null default true;
alter table public.lessons add column if not exists pdf_path text not null default '';
insert into public.subjects(batch_id,name)
 select distinct batch_id,coalesce(nullif(trim(subject),''),'General') from public.lessons where subject_id is null
 on conflict do nothing;
insert into public.subjects(batch_id,name)
 select b.id,trim(part) from public.batches b,
 lateral regexp_split_to_table(b.subjects,'[·,;\n]+') part
 where length(trim(part)) between 1 and 100 and not exists(select 1 from public.subjects s where s.batch_id=b.id) on conflict do nothing;
update public.lessons l set subject_id=s.id from public.subjects s
 where l.subject_id is null and s.batch_id=l.batch_id
 and lower(trim(s.name))=lower(coalesce(nullif(trim(l.subject),''),'General'));
do $$ begin
 if not exists(select 1 from pg_constraint where conname='lessons_subject_batch_fk' and conrelid='public.lessons'::regclass) then
  alter table public.lessons add constraint lessons_subject_batch_fk
   foreign key(subject_id,batch_id) references public.subjects(id,batch_id) on delete cascade;
 end if;
end $$;
alter table public.lessons alter column subject_id set not null;
create index if not exists lessons_subject_order_idx on public.lessons(subject_id,position);
create or replace function private.validate_lesson() returns trigger
language plpgsql set search_path='' as $$
begin
 select name into new.subject from public.subjects where id=new.subject_id and batch_id=new.batch_id;
 if new.subject is null then raise exception 'Choose a subject from this batch'; end if;
 if new.position<1 or length(trim(new.title))=0 then raise exception 'Class name and positive order required'; end if;
 if new.published and length(trim(new.video_url))=0 then raise exception 'Add a video before publishing this class'; end if;
 if new.pdf_path<>'' and (split_part(new.pdf_path,'/',1)<>new.batch_id::text or split_part(new.pdf_path,'/',2)<>new.id::text) then
  raise exception 'PDF must belong to this batch and class';
 end if;
 return new;
end $$;
drop trigger if exists sure60_validate_lesson on public.lessons;
create trigger sure60_validate_lesson before insert or update on public.lessons
 for each row execute function private.validate_lesson();
alter table public.subjects enable row level security;
drop policy if exists sure60_subjects_read on public.subjects;
create policy sure60_subjects_read on public.subjects for select to authenticated using(private.can_access_batch(batch_id));
drop policy if exists sure60_subjects_admin on public.subjects;
create policy sure60_subjects_admin on public.subjects for all to authenticated using(private.is_admin()) with check(private.is_admin());
revoke all on public.subjects from anon,authenticated;
grant select,insert,update,delete on public.subjects to authenticated;
drop policy if exists sure60_lessons_read on public.lessons;
create policy sure60_lessons_read on public.lessons for select to authenticated
 using(private.is_admin() or (published and private.can_access_batch(batch_id)));

create or replace function public.admin_create_subject(p_batch uuid,p_name text,p_classes integer default 5) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_subject uuid; n integer;
begin
 if not private.is_admin() then raise exception 'Administrator access required'; end if;
 if p_classes is null or p_classes not in (4,5) then raise exception 'Choose 4 or 5 starter classes'; end if;
 insert into public.subjects(batch_id,name,minimum_classes,position)
 values(p_batch,trim(p_name),p_classes,coalesce((select max(position)+1 from public.subjects where batch_id=p_batch),1)) returning id into v_subject;
 for n in 1..p_classes loop
  insert into public.lessons(batch_id,subject_id,subject,title,video_url,position,published)
  values(p_batch,v_subject,trim(p_name),'Class '||n,'',n,false);
 end loop;
 return v_subject;
end $$;
revoke all on function public.admin_create_subject(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.admin_create_subject(uuid,text,integer) to authenticated;

-- Passwords stay hashed in auth.users; this SQL-Editor-only helper grants the admin role.
-- First create the email/password with Authentication > Users > Add user, then call:
-- select private.promote_admin('YOUR_REAL_ADMIN_EMAIL');
create or replace function private.promote_admin(p_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.profiles set role='admin',verified=true,full_name='Administrator'
 where id=(select id from auth.users where lower(email)=lower(trim(p_email)));
 if not found then raise exception 'Create this account in Supabase Authentication first'; end if;
end $$;

-- Enable in Supabase Authentication > Hooks > Custom Access Token, after creating admin.
-- Blocks token issuance AND refresh until the table's verified flag is explicitly true.
create or replace function public.approved_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=(event->>'user_id')::uuid and verified=true) then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Account awaiting administrator approval.'));
 end if;
 return event;
end $$;
revoke all on function public.approved_access_token_hook(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.approved_access_token_hook(jsonb) to supabase_auth_admin;

-- Private PDF storage. Policies check enrollment, approval and published lesson ownership.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('class-notes','class-notes',false,15728640,array['application/pdf'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists sure60_notes_read on storage.objects;
create policy sure60_notes_read on storage.objects for select to authenticated using(
 bucket_id='class-notes' and (private.is_admin() or exists(
  select 1 from public.lessons l where l.pdf_path=name and l.published and private.can_access_batch(l.batch_id)
 )));
drop policy if exists sure60_notes_insert on storage.objects;
create policy sure60_notes_insert on storage.objects for insert to authenticated
 with check(bucket_id='class-notes' and private.is_admin());
drop policy if exists sure60_notes_update on storage.objects;
create policy sure60_notes_update on storage.objects for update to authenticated
 using(bucket_id='class-notes' and private.is_admin()) with check(bucket_id='class-notes' and private.is_admin());
drop policy if exists sure60_notes_delete on storage.objects;
create policy sure60_notes_delete on storage.objects for delete to authenticated
 using(bucket_id='class-notes' and private.is_admin());

-- Security-definer functions must NOT inherit PostgreSQL's PUBLIC execute default.
revoke all on all functions in schema private from public,anon,authenticated;
grant usage on schema private to anon,authenticated;
grant execute on function private.is_admin(),private.is_verified(),private.can_access_batch(uuid),private.can_access_test(uuid) to anon,authenticated;
revoke all on function public.admin_update_student(uuid,boolean),public.admin_create_test(jsonb,jsonb),public.start_test(uuid),public.save_test_answers(uuid,jsonb),public.submit_test(uuid,jsonb),public.get_leaderboard(uuid) from public,anon,authenticated;
grant execute on function public.admin_update_student(uuid,boolean),public.admin_create_test(jsonb,jsonb),public.start_test(uuid),public.save_test_answers(uuid,jsonb),public.submit_test(uuid,jsonb),public.get_leaderboard(uuid) to authenticated;
commit;

-- Supabase Cron finalizes expired attempts even if a student closes their browser.
-- If not available, enable pg_cron under Database > Extensions and rerun this block.
do $cron_setup$
begin
 execute 'create extension if not exists pg_cron with schema pg_catalog';
 if not exists(select 1 from cron.job where jobname='sure60-expire-tests') then
  perform cron.schedule('sure60-expire-tests','* * * * *','select private.expire_attempts();');
 end if;
exception when others then
 raise warning 'Cron not installed: %. Enable pg_cron and rerun the cron block. Until then expired tests finalize on the next test/leaderboard request.',sqlerrm;
end $cron_setup$;
