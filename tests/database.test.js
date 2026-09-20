import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Supabase schema permissions, enrollment and exam lifecycle', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role supabase_auth_admin;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated;
  `);
  const sql = await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
  // pg_cron is a Supabase extension, not included in the WASM PostgreSQL runtime.
  const schema = sql.split('-- Supabase Cron finalizes')[0];
  await db.exec(schema);
  await db.exec(schema); // The SQL Editor script is repeatable.
  const ids = {
    admin:'00000000-0000-4000-8000-000000000001',
    pending:'00000000-0000-4000-8000-000000000002',
    student:'00000000-0000-4000-8000-000000000003',
    other:'00000000-0000-4000-8000-000000000004'
  };
  for (const [name,id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',
      [id,`${name}@example.test`,JSON.stringify({username:name,full_name:name,role:'admin',verified:true})]);
  }
  await db.query("update public.profiles set role='admin',verified=true where id=$1",[ids.admin]);
  await db.query('update public.profiles set verified=true where id in ($1,$2)',[ids.student,ids.other]);
  const as = async (name, fn) => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]]);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const rpc = async (name, args) => (await db.query(
    `select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result;
  const questions = [
    {body:'2 + 2?',options:['1','2','3','4'],answer:3},
    {body:'Campus city?',options:['Karnal','Delhi','Jaipur','Pune'],answer:0},
    {body:'3 + 3?',options:['3','4','5','6'],answer:3}
  ];
  const makeTest = (extra={}) => as('admin',()=>rpc('admin_create_test',[
    {title:'Mock exam',duration_minutes:5,marks:2,negative_marks:0.5,...extra},questions]));
  let batch, testId, privateTest, attempt, qids;

  await t.test('signup metadata cannot self-grant approval or administrator role',async()=>{
    const p=(await db.query('select * from public.profiles where id=$1',[ids.pending])).rows[0];
    assert.equal(p.role,'student'); assert.equal(p.verified,false);
  });
  await t.test('unverified student cannot self-approve, read answers, or edit settings',async()=>{
    await as('pending',async()=>{
      await assert.rejects(db.exec('update public.profiles set verified=true'),/permission denied/);
      await assert.rejects(db.exec('select * from private.answer_keys'),/permission denied/);
      await assert.rejects(rpc('admin_update_student',[ids.pending,true]),/Administrator access required/);
      const result=await db.query("update public.site_settings set data='{}' returning id");
      assert.equal(result.rows.length,0);
    });
  });
  await t.test('admin creates batches, assignments and subject lessons',async()=>{
    batch=(await as('admin',()=>db.query("insert into public.batches(title) values('SSC') returning id"))).rows[0].id;
    await as('admin',()=>db.query('insert into public.enrollments(student_id,batch_id) values($1,$2)',[ids.student,batch]));
    const subject=await as('admin',()=>rpc('admin_create_subject',[batch,'Maths',5]));
    const drafts=(await as('admin',()=>db.query('select * from public.lessons where subject_id=$1',[subject]))).rows;
    assert.equal(drafts.length,5); assert.ok(drafts.every(l=>!l.published));
    assert.equal((await as('student',()=>db.query('select * from public.lessons'))).rows.length,0);
    await as('admin',()=>db.query("update public.lessons set title='Algebra',video_url='https://youtu.be/abcdefghijk',published=true where id=$1",[drafts[0].id]));
    assert.equal((await as('student',()=>db.query('select * from public.lessons'))).rows.length,1);
    assert.equal((await as('other',()=>db.query('select * from public.lessons'))).rows.length,0);
    assert.equal((await as('pending',()=>db.query('select * from public.lessons'))).rows.length,0);
  });
  await t.test('approval hook refuses pending tokens and refresh, admin helper is private',async()=>{
    const pending=await rpc('approved_access_token_hook',[{user_id:ids.pending,claims:{}}]);
    assert.equal(pending.error.http_code,403);
    const allowed=await rpc('approved_access_token_hook',[{user_id:ids.student,claims:{role:'authenticated'}}]);
    assert.equal(allowed.claims.role,'authenticated');
    await assert.rejects(as('pending',()=>rpc('approved_access_token_hook',[{user_id:ids.admin}])),/permission denied/);
    await assert.rejects(as('pending',()=>db.query('select private.promote_admin($1)',['pending@example.test'])),/permission denied/);
  });
  await t.test('subjects support multiple courses and cannot cross batch boundaries',async()=>{
    const subject=await as('admin',()=>rpc('admin_create_subject',[batch,'English',4]));
    assert.equal((await as('admin',()=>db.query('select * from public.lessons where subject_id=$1',[subject]))).rows.length,4);
    await assert.rejects(as('admin',()=>rpc('admin_create_subject',[batch,' maths ',5])),/duplicate key/);
    await assert.rejects(as('student',()=>rpc('admin_create_subject',[batch,'Hacked',5])),/Administrator access required/);
    const otherBatch=(await as('admin',()=>db.query("insert into public.batches(title) values('Other') returning id"))).rows[0].id;
    await assert.rejects(as('admin',()=>db.query("insert into public.lessons(batch_id,subject_id,subject,title,video_url) values($1,$2,'English','Invalid','video')",[otherBatch,subject])),/Choose a subject/);
    assert.equal((await as('pending',()=>db.query('select * from public.subjects'))).rows.length,0);
    assert.equal((await as('other',()=>db.query('select * from public.subjects'))).rows.length,0);
  });
  await t.test('private PDF storage checks enrollment, publication and verified flag',async()=>{
    const lesson=(await db.query('select * from public.lessons where published=true limit 1')).rows[0];
    const path=`${batch}/${lesson.id}/notes.pdf`;
    await as('admin',()=>db.query('update public.lessons set pdf_path=$1 where id=$2',[path,lesson.id]));
    await as('admin',()=>db.query("insert into storage.objects(bucket_id,name) values('class-notes',$1)",[path]));
    assert.equal((await as('student',()=>db.query('select * from storage.objects'))).rows.length,1);
    for(const name of ['pending','other']) assert.equal((await as(name,()=>db.query('select * from storage.objects'))).rows.length,0);
    await assert.rejects(as('student',()=>db.query("insert into storage.objects(bucket_id,name) values('class-notes','hack.pdf')")),/row-level security/);
    await as('admin',()=>db.query('update public.lessons set published=false where id=$1',[lesson.id]));
    assert.equal((await as('student',()=>db.query('select * from storage.objects'))).rows.length,0);
    await as('admin',()=>db.query('update public.lessons set published=true where id=$1',[lesson.id]));
  });
  await t.test('question publishing is atomic and answer key stays private',async()=>{
    testId=await makeTest(); privateTest=await makeTest({batch_id:batch});
    const before=(await db.query('select count(*) from public.tests')).rows[0].count;
    await assert.rejects(as('admin',()=>rpc('admin_create_test',[
      {title:'Bad exam',duration_minutes:5,marks:1,negative_marks:0},[{...questions[0],answer:-1}]
    ])),/Missing answer/);
    assert.equal((await db.query('select count(*) from public.tests')).rows[0].count,before);
    await assert.rejects(as('student',()=>db.query('select * from private.answer_keys')),/permission denied/);
    assert.equal((await as('student',()=>db.query('select * from public.questions'))).rows.length,0);
  });
  await t.test('approval and batch assignment required before starting tests',async()=>{
    await assert.rejects(as('pending',()=>rpc('start_test',[testId])),/Verified account/);
    await assert.rejects(as('other',()=>rpc('start_test',[privateTest])),/Verified account/);
    attempt=await as('student',()=>rpc('start_test',[testId]));
    const resumed=await as('student',()=>rpc('start_test',[testId]));
    assert.equal(attempt.id,resumed.id); assert.equal(attempt.deadline,resumed.deadline);
    qids=(await as('student',()=>db.query('select id from public.questions where test_id=$1 order by position',[testId]))).rows.map(q=>q.id);
    assert.equal(qids.length,3);
  });
  await t.test('answer payload and ownership checked by database',async()=>{
    await assert.rejects(as('student',()=>rpc('save_test_answers',[attempt.id,{[qids[0]]:9}])),/Invalid answer/);
    await assert.rejects(as('student',()=>rpc('save_test_answers',[attempt.id,{'not-a-question':0}])),/Invalid answer/);
    await assert.rejects(as('other',()=>rpc('submit_test',[attempt.id,{}])),/Attempt access denied/);
    await assert.rejects(as('student',()=>db.exec('update public.attempts set score=999')),/permission denied/);
  });
  await t.test('manual grading counts right, wrong, unanswered and negative marking',async()=>{
    const answers={[qids[0]]:3,[qids[1]]:1};
    await as('student',()=>rpc('save_test_answers',[attempt.id,answers]));
    const result=await as('student',()=>rpc('submit_test',[attempt.id,answers]));
    assert.equal(result.correct,1); assert.equal(result.wrong,1); assert.equal(result.unanswered,1); assert.equal(result.score,1.5);
    const again=await as('student',()=>rpc('submit_test',[attempt.id,{[qids[0]]:0}]));
    assert.equal(again.score,result.score);
    const board=(await as('student',()=>db.query('select * from public.get_leaderboard($1)',[testId]))).rows;
    assert.equal(board[0].username,'student'); assert.equal(Number(board[0].rank),1);
    await assert.rejects(as('pending',()=>rpc('get_leaderboard',[testId])),/verified account/);
  });
  await t.test('late answers are ignored and expired saved answers are graded',async()=>{
    const a=await as('other',()=>rpc('start_test',[testId]));
    await as('other',()=>rpc('save_test_answers',[a.id,{[qids[0]]:3}]));
    await db.query("update public.attempts set deadline=clock_timestamp()-interval '1 second' where id=$1",[a.id]);
    await assert.rejects(as('other',()=>rpc('save_test_answers',[a.id,{[qids[0]]:0}])),/Test time is over/);
    const result=await as('other',()=>rpc('submit_test',[a.id,{[qids[0]]:0,[qids[1]]:1}]));
    assert.equal(result.correct,1); assert.equal(result.wrong,0); assert.equal(result.score,2);
    const board=(await as('student',()=>db.query('select * from public.get_leaderboard($1)',[testId]))).rows;
    assert.deepEqual(board.map(r=>r.username),['other','student']);
  });
  await t.test('expiry worker finalizes closed-browser attempts and revocation blocks lessons',async()=>{
    const a=await as('student',()=>rpc('start_test',[privateTest]));
    await db.query("update public.attempts set deadline=clock_timestamp()-interval '1 second' where id=$1",[a.id]);
    await db.exec('select private.expire_attempts()');
    const result=(await db.query('select * from public.attempts where id=$1',[a.id])).rows[0];
    assert.ok(result.submitted_at); assert.equal(result.unanswered,3);
    await as('admin',()=>rpc('admin_update_student',[ids.student,false]));
    assert.equal((await as('student',()=>db.query('select * from public.lessons'))).rows.length,0);
    assert.equal((await as('student',()=>db.query('select * from storage.objects'))).rows.length,0);
    assert.equal((await rpc('approved_access_token_hook',[{user_id:ids.student}])).error.http_code,403);
  });
  await t.test('admin may hide an existing test without inserting a partial row',async()=>{
    await as('admin',()=>db.query('update public.tests set published=false where id=$1',[testId]));
    const result=(await db.query('select published from public.tests where id=$1',[testId])).rows[0];
    assert.equal(result.published,false);
  });
});
