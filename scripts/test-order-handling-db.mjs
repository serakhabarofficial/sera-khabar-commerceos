// Real PostgreSQL integration/race tests; never uses a linked or remote database.
import assert from 'node:assert/strict';
import { execFileSync, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const bin = process.env.PG_BINDIR || '/opt/homebrew/opt/postgresql@18/bin';
const work = mkdtempSync(join(tmpdir(), 'order-handling-'));
const socket = join(work, 'socket'); mkdirSync(socket);
const run = (name, args) => execFileSync(join(bin, name), args, { encoding:'utf8', stdio:'pipe' });
const connection = ['-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',socket,'postgres'];
const sql = (query) => run('psql', [...connection, '-qAt', '-c', query]).trim();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const org=id(1), otherOrg=id(2), u=id(3), v=id(4), session=id(5), otherSession=id(6);
const resource = (kind,n) => ({kind,id:id(n)});
const callSql = (action, resources=[resource('order',10)], user=u, tab=session, active=false, operation=null) =>
  `set role service_role; select public.order_handling('${org}','${user}','${tab}','${JSON.stringify(resources)}'::jsonb,'${action}',${active},${operation ? `'${operation}'` : 'null'});`;
const call = (...args) => JSON.parse(sql(callSql(...args)));
const reset = () => sql('truncate public.order_handling_leases');
const expectError = (query, code) => {
  let caught;
  try { sql(query); } catch (error) { caught=error; }
  assert.ok(caught, `Expected SQLSTATE ${code}`);
  assert.match(String(caught.stderr), new RegExp(code));
};
let started=false;
try {
  run('initdb',['-D',join(work,'data'),'--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',join(work,'data'),'-l',join(work,'pg.log'),'-o',`-k ${socket} -c listen_addresses=`, 'start']); started=true;
  // Reuse the canonical verifier's bootstrap verbatim, without executing its runner.
  const verifier=readFileSync(join(root,'scripts/verify-supabase-baseline.mjs'),'utf8');
  sql(verifier.match(/const bootstrapSql = `([\s\S]*?)`;/)[1]);
  const shared=run('pg_config',['--sharedir']).trim();
  for (const name of readdirSync(join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()) {
    let migration=readFileSync(join(root,'supabase/migrations',name),'utf8');
    if (!existsSync(join(shared,'extension/vector.control'))) migration=migration.replace(/create extension if not exists vector with schema extensions;\n/i,'').replaceAll('extensions.vector(1536)','text').replace(/create(?: or replace)? function public\.match_products_by_embedding\([\s\S]*?\n\$\$;\n/i,'');
    const path=join(work,'migration.sql'); writeFileSync(path,migration); run('psql',[...connection,'-f',path]);
  }
  sql(`insert into auth.users(id) values('${u}'),('${v}');
    insert into public.user_roles(user_id,org_id,display_name) values('${u}','${org}','Alice'),('${v}','${org}','Bob');
    insert into public.orders(id,org_id,order_number) values('${id(10)}','${org}','A'),('${id(11)}','${org}','B'),('${id(12)}','${otherOrg}','Foreign');
    insert into public.abandoned_checkouts(id,org_id,draft_key,source,source_path) values('${id(20)}','${org}','${id(21)}','storefront','/checkout');
    insert into public.order_protection_reviews(id,org_id,source_route,score,expires_at,abandoned_checkout_id) values('${id(30)}','${org}','test',0,now()+interval '1 day','${id(20)}');`);
  assert.equal(call('acquire').status,'handling');
  assert.deepEqual(call('acquire',undefined,v,otherSession).holder,{name:'Alice'});
  assert.equal(call('acquire',undefined,u,otherSession).status,'view_only');
  call('release',undefined,v,otherSession); assert.equal(call('status').status,'handling');
  sql(`update public.order_handling_leases set activity_at=now()-interval '6 minutes'`);
  assert.equal(call('heartbeat',undefined,u,session,true).status,'available');
  assert.equal(call('status').status,'available');
  // A background status poll never creates a lease.
  assert.equal(sql(`select count(*) from public.order_handling_leases where handler_user is not null and activity_at>now()-interval '5 minutes'`),'0');
  call('acquire',undefined,v,otherSession); call('release');
  assert.equal(call('status',undefined,v,otherSession).status,'handling');
  reset(); call('acquire'); sql(`update public.order_handling_leases set heartbeat_at=now()-interval '61 seconds'`);
  assert.equal(call('heartbeat',undefined,u,session,true).status,'available');
  reset(); call('acquire'); sql(`update public.order_handling_leases set activity_at=now()-interval '4 minutes'`);
  call('heartbeat'); assert.equal(sql(`select bool_and(activity_at < now()-interval '3 minutes') from public.order_handling_leases`),'t');
  call('heartbeat',undefined,u,session,true);
  assert.equal(sql(`select bool_and(activity_at>now()-interval '10 seconds') from public.order_handling_leases`),'t');
  reset(); call('acquire',[resource('order',11)],v,otherSession);
  assert.equal(call('begin_write',[resource('order',10),resource('order',11)]).success,false);
  assert.equal(call('status').status,'available');
  reset(); call('acquire'); const busy=call('begin_write'); assert.equal(busy.success,true); assert.ok(busy.operation);
  call('release'); assert.equal(call('acquire',undefined,v,otherSession).status,'view_only');
  assert.equal(call('begin_write').success,false); // even same session cannot overlap
  call('end_write',[],u,session,false,id(99)); assert.equal(call('acquire',undefined,v,otherSession).status,'view_only');
  call('end_write',[],v,otherSession,false,busy.operation);
  assert.equal(call('status',undefined,v,otherSession).status,'view_only');
  call('end_write',[],u,session,false,busy.operation); assert.equal(call('acquire',undefined,v,otherSession).status,'handling');
  reset(); call('acquire'); const preserve=call('begin_write'); call('end_write',[],u,session,false,preserve.operation); assert.equal(call('status').status,'handling');
  reset(); const renewed=call('begin_write');
  sql(`update public.order_handling_leases set busy_until=now()+interval '5 seconds'`);
  assert.equal(call('renew_write',[],v,otherSession,false,renewed.operation).success,false);
  assert.equal(call('renew_write',[],u,session,false,renewed.operation).success,true);
  assert.equal(sql(`select bool_and(busy_until>now()+interval '9 minutes') from public.order_handling_leases`),'t');
  sql(`update public.order_handling_leases set busy_until=now()-interval '1 second'`);
  assert.equal(call('renew_write',[],u,session,false,renewed.operation).success,false);
  reset(); const expiring=call('begin_write');
  sql(`update public.order_handling_leases set busy_until=now()-interval '1 second'`);
  assert.equal(call('acquire',undefined,v,otherSession).status,'handling');
  call('end_write',[],u,session,false,expiring.operation);
  assert.equal(call('status',undefined,v,otherSession).status,'handling');
  reset(); call('acquire'); call('acquire',[resource('order',11)],v,otherSession);
  sql(`insert into public.order_risk_attempts(id,org_id,order_id,route,mode,decision,score) values('${id(60)}','${org}','${id(10)}','public_v1','active','HOLD',0)`);
  expectError(`update public.orders set risk_attempt_id='${id(60)}' where id='${id(11)}'`,'55P03');
  assert.equal(sql(`select risk_attempt_id is null from public.orders where id='${id(11)}'`),'t');
  reset(); const abandoned=[resource('abandoned',20)], review=[resource('review',30)]; call('acquire',abandoned);
  assert.equal(call('acquire',review,v,otherSession).status,'view_only');
  const conversion=call('begin_write',abandoned); call('release',abandoned);
  sql(`insert into public.orders(id,org_id,order_number,abandoned_checkout_id) values('${id(40)}','${org}','Converted','${id(20)}');`);
  assert.equal(call('acquire',[resource('order',40)],v,otherSession).status,'view_only');
  call('end_write',[],u,session,false,conversion.operation);
  assert.equal(call('acquire',[resource('order',40)],v,otherSession).status,'handling');
  assert.equal(call('status',review).status,'view_only');
  reset(); const deletion=call('begin_write',[resource('order',11)]);
  sql(`delete from public.orders where id='${id(11)}'`);
  call('end_write',[],u,session,false,deletion.operation);
  assert.equal(sql(`select count(*) from public.order_handling_leases where busy_operation='${deletion.operation}'`),'0');
  // Removing the source link after conversion cannot orphan the copied claim.
  reset(); const detached=call('begin_write',abandoned);
  sql(`insert into public.orders(id,org_id,order_number,abandoned_checkout_id) values('${id(41)}','${org}','Detached','${id(20)}'); update public.orders set abandoned_checkout_id=null where id='${id(41)}'`);
  assert.equal(call('acquire',[resource('order',41)],v,otherSession).status,'view_only');
  call('end_write',[],u,session,false,detached.operation);
  reset(); sql(`update public.orders set abandoned_checkout_id=null, abandoned_draft_key_hash=encode(extensions.digest('${id(21)}','sha256'),'hex') where id='${id(40)}'`);
  call('acquire',review); assert.equal(call('acquire',[resource('order',40)],v,otherSession).status,'view_only');
  reset(); sql(`insert into public.order_risk_attempts(id,org_id,order_id,review_id,route,mode,decision,score) values('${id(50)}','${org}','${id(10)}','${id(30)}','public_v1','active','HOLD',0); update public.order_protection_reviews set attempt_id='${id(50)}' where id='${id(30)}'`);
  call('acquire',review); assert.equal(call('acquire',undefined,v,otherSession).status,'view_only');
  reset(); sql(`update public.order_protection_reviews set abandoned_checkout_id=null,attempt_id=null,abandoned_draft_key_hash=encode(extensions.digest('${id(21)}','sha256'),'hex') where id='${id(30)}'; update public.order_risk_attempts set order_id=null,review_id=null where id='${id(50)}'`);
  call('acquire',review); assert.equal(call('acquire',[resource('order',40)],v,otherSession).status,'view_only');
  reset(); sql(`update public.order_protection_reviews set abandoned_draft_key_hash=null where id='${id(30)}'; insert into public.order_risk_attempts(id,org_id,order_id,review_id,route,mode,decision,score) values('${id(70)}','${org}','${id(10)}','${id(30)}','public_v1','active','HOLD',0)`);
  call('acquire',review); assert.equal(call('acquire',undefined,v,otherSession).status,'view_only');
  reset(); sql(`update public.order_risk_attempts set order_id=null,review_id=null where id='${id(70)}'; update public.orders set risk_attempt_id='${id(70)}' where id='${id(10)}'; update public.order_protection_reviews set attempt_id='${id(70)}' where id='${id(30)}'`);
  call('acquire',review); assert.equal(call('acquire',undefined,v,otherSession).status,'view_only');
  reset(); sql(`update public.user_roles set display_name='  ' where user_id='${u}'`); call('acquire');
  assert.deepEqual(call('status',undefined,v,otherSession).holder,{name:'Team member'});
  reset(); sql(`update public.user_roles set org_id='${otherOrg}' where user_id='${v}'`);
  expectError(callSql('acquire',undefined,v,otherSession),'P0002');
  sql(`update public.user_roles set org_id='${org}' where user_id='${v}'`);
  expectError(callSql('status',[resource('order',12)]),'P0002');
  expectError(callSql('status',[],u),'22023');
  expectError(callSql('bad'),'22023');
  expectError(callSql('end_write',[{kind:'order',id:'bad'}],u,session,false,id(99)),'22023');
  expectError(callSql('status',[{kind:'order',id:'bad'}]),'22023');
  expectError(callSql('begin_write',Array.from({length:501},()=>resource('order',10))),'22023');
  expectError(callSql('status',undefined,id(90)),'P0002');
  assert.equal(sql(`select has_function_privilege('anon','public.order_handling(uuid,uuid,uuid,jsonb,text,boolean,uuid)','execute') or has_function_privilege('authenticated','public.order_handling(uuid,uuid,uuid,jsonb,text,boolean,uuid)','execute')`),'f');
  expectError(`set role authenticated; select * from public.order_handling_leases`,'42501');
  // Hold the first transaction open and prove the competing process waits.
  async function race(first, second) {
  reset(); const winner=spawn(join(bin,'psql'),[...connection,'-qAt'],{stdio:['pipe','pipe','pipe']});
  const held=new Promise((resolve,reject)=>{let out='',err=''; const timer=setTimeout(()=>reject(new Error('Winner did not acquire race lock')),10000); winner.stderr.on('data',chunk=>{err+=chunk;}); winner.stdout.on('data',chunk=>{out+=chunk;if(out.includes('LOCK_HELD')){clearTimeout(timer);resolve();}});winner.once('error',reject);winner.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error(err));});});
  const exited=new Promise(resolve=>winner.once('exit',resolve));
  winner.stdin.write(`begin; ${first}\n\\echo LOCK_HELD\n`); await held;
  const loser=promisify(execFile)(join(bin,'psql'),[...connection,'-qAt','-c',second],{env:{...process.env,PGAPPNAME:'order-handling-racer'}});
  try { sql(`do $$ begin for i in 1..500 loop perform pg_stat_clear_snapshot(); if exists(select 1 from pg_stat_activity where application_name='order-handling-racer' and wait_event_type='Lock') then return; end if; perform pg_sleep(0.01); end loop; raise exception 'Race did not overlap'; end $$;`); }
  finally { winner.stdin.end('commit;\n'); await exited; }
  return JSON.parse((await loser).stdout.trim());
  }
  assert.equal((await race(callSql('acquire'),callSql('acquire',undefined,v,otherSession))).status,'view_only');
  // Both sets include order 10, but loser must not reserve independent order 41.
  const contested=await race(callSql('begin_write',[resource('order',10),resource('order',40)]),callSql('begin_write',[resource('order',41),resource('order',10)],v,otherSession));
  assert.equal(contested.success,false);
  assert.equal(call('status',[resource('order',41)],v,otherSession).status,'available');
  console.log('Order handling DB: ownership, expiry, atomic claims, conversion, privileges, and overlapping transaction race passed');
} finally {
  if(started) run('pg_ctl',['-D',join(work,'data'),'stop','-m','fast']);
  rmSync(work,{recursive:true,force:true});
}
