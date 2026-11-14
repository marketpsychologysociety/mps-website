import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteTransactionalStore } from './sqlite-transactional-store.mjs';

async function fixture(t) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'mps-p124-sqlite-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return path.join(dir,'synthetic-draw.sqlite');
}

test('SQLite transaction atomically updates draw, idempotency and outbox', async t => {
  const file=await fixture(t), store=new SQLiteTransactionalStore(file);
  t.after(()=>store.close());
  store.seedDraw({drawId:'draw-a',ownerSubject:'operator-a'});
  const result=store.execute({drawId:'draw-a',subject:'operator-a',key:'idem-a',payload:{action:'execute'},expectedVersion:1});
  assert.equal(result.status,202);
  assert.deepEqual(store.readDraw('draw-a'),{drawId:'draw-a',ownerSubject:'operator-a',state:'DRAWN_UNVERIFIED',version:2});
  assert.equal(store.operationCount(),1);
  assert.deepEqual(store.outboxRows(),[{event_type:'DRAW_EXECUTED',delivery_state:'PENDING'}]);
});

test('same idempotency request replays; changed payload conflicts', async t => {
  const file=await fixture(t), store=new SQLiteTransactionalStore(file);
  t.after(()=>store.close());
  store.seedDraw({drawId:'draw-b',ownerSubject:'operator-b'});
  const args={drawId:'draw-b',subject:'operator-b',key:'same-key',payload:{x:1},expectedVersion:1};
  assert.equal(store.execute(args).status,202);
  assert.equal(store.execute(args).replayed,true);
  assert.equal(store.execute({...args,payload:{x:2}}).code,'IDEMPOTENCY_CONFLICT');
  assert.equal(store.operationCount(),1);
});

test('rollback before commit leaves no partial draw, operation or outbox state', async t => {
  const file=await fixture(t), store=new SQLiteTransactionalStore(file);
  t.after(()=>store.close());
  store.seedDraw({drawId:'draw-c',ownerSubject:'operator-c'});
  assert.equal(store.execute({drawId:'draw-c',subject:'operator-c',key:'abort',payload:{},expectedVersion:1,fault:'before_commit'}).code,'TRANSACTION_ABORTED');
  assert.deepEqual(store.readDraw('draw-c'),{drawId:'draw-c',ownerSubject:'operator-c',state:'BEACON_COMMITTED',version:1});
  assert.equal(store.operationCount(),0);
  assert.deepEqual(store.outboxRows(),[]);
});

test('commit-before-ack failure replays the committed operation after reopening database', async t => {
  const file=await fixture(t);
  let store=new SQLiteTransactionalStore(file);
  store.seedDraw({drawId:'draw-d',ownerSubject:'operator-d'});
  const args={drawId:'draw-d',subject:'operator-d',key:'lost-ack',payload:{},expectedVersion:1};
  assert.equal(store.execute({...args,fault:'after_commit_before_ack'}).code,'ACKNOWLEDGMENT_LOST');
  store.close();
  store=new SQLiteTransactionalStore(file);
  t.after(()=>store.close());
  assert.equal(store.readDraw('draw-d').version,2);
  const replay=store.execute(args);
  assert.equal(replay.status,200);
  assert.equal(replay.replayed,true);
  assert.equal(store.operationCount(),1);
  assert.equal(store.outboxRows().length,1);
});

test('database constraints reject invalid states and duplicate operation scope', async t => {
  const file=await fixture(t), store=new SQLiteTransactionalStore(file);
  t.after(()=>store.close());
  store.seedDraw({drawId:'draw-e',ownerSubject:'operator-e'});
  const db=new DatabaseSync(file);
  assert.throws(()=>db.prepare("UPDATE draw_records SET state='PUBLISHED' WHERE draw_id=?").run('draw-e'));
  store.execute({drawId:'draw-e',subject:'operator-e',key:'unique-key',payload:{},expectedVersion:1});
  assert.throws(()=>db.prepare("INSERT INTO idempotency_operations(operation_id,subject,draw_id,idempotency_key,request_digest,result_json,created_at_utc) VALUES('other-op','operator-e','draw-e','unique-key',?,'{}',?)").run('a'.repeat(64),new Date().toISOString()));
  db.close();
});

test('owner, version, state and request validation fail closed', async t => {
  const file=await fixture(t), store=new SQLiteTransactionalStore(file);
  t.after(()=>store.close());
  store.seedDraw({drawId:'draw-f',ownerSubject:'operator-f'});
  const args={drawId:'draw-f',subject:'operator-f',key:'key-f',payload:{},expectedVersion:1};
  assert.equal(store.execute({...args,subject:'intruder'}).code,'NOT_FOUND');
  assert.equal(store.execute({...args,expectedVersion:2}).code,'VERSION_MISMATCH');
  assert.equal(store.execute({...args,drawId:'missing'}).code,'NOT_FOUND');
  assert.equal(store.execute({...args,drawId:'draw-f',key:''}).code,'INVALID_REQUEST');
  assert.equal(store.execute(args).status,202);
  assert.equal(store.execute({...args,key:'new-key',expectedVersion:2}).code,'INVALID_STATE');
});

test('canonical payload key ordering preserves idempotent replay', async t => {
  const file=await fixture(t), store=new SQLiteTransactionalStore(file);
  t.after(()=>store.close());
  store.seedDraw({drawId:'draw-g',ownerSubject:'operator-g'});
  const args={drawId:'draw-g',subject:'operator-g',key:'canonical-key',payload:{z:1,a:{y:2,x:3}},expectedVersion:1};
  assert.equal(store.execute(args).status,202);
  assert.equal(store.execute({...args,payload:{a:{x:3,y:2},z:1}}).replayed,true);
  assert.equal(store.operationCount(),1);
});

test('outbox insert failure rolls back draw and idempotency together', async t => {
  const file=await fixture(t), store=new SQLiteTransactionalStore(file);
  t.after(()=>store.close());
  store.seedDraw({drawId:'draw-h',ownerSubject:'operator-h'});
  const db=new DatabaseSync(file);
  db.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'synthetic outbox failure'); END;");
  assert.throws(()=>store.execute({drawId:'draw-h',subject:'operator-h',key:'outbox-fail',payload:{},expectedVersion:1}));
  assert.deepEqual(store.readDraw('draw-h'),{drawId:'draw-h',ownerSubject:'operator-h',state:'BEACON_COMMITTED',version:1});
  assert.equal(store.operationCount(),0);
  assert.deepEqual(store.outboxRows(),[]);
  db.close();
});

test('database path must be absolute and file-backed', () => {
  assert.throws(()=>new SQLiteTransactionalStore(':memory:'),/ABSOLUTE_DATABASE_FILE_REQUIRED/);
  assert.throws(()=>new SQLiteTransactionalStore('relative.sqlite'),/ABSOLUTE_DATABASE_FILE_REQUIRED/);
});
