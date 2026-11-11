import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function fixture(t, name='failure.sqlite') {
  const dir=await mkdtemp(path.join(os.tmpdir(),'mps-p127-sqlite-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,name);
  const db=new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT; INSERT INTO sample VALUES(1,\'original\');');
  db.close();
  return {dir,file};
}
function open(file){return new DatabaseSync(file);}
function integrity(db){return Object.values(db.prepare('PRAGMA integrity_check').get())[0];}

test('query-only connection rejects writes and leaves the committed source unchanged',async t=>{
  const {file}=await fixture(t);
  const db=open(file);
  db.exec('PRAGMA query_only=ON');
  assert.throws(()=>db.prepare('UPDATE sample SET value=? WHERE id=1').run('tampered'),/readonly|read-only/i);
  assert.equal(db.prepare('SELECT value FROM sample WHERE id=1').get().value,'original');
  assert.equal(integrity(db),'ok');
  db.close();
  const reopened=open(file);
  assert.equal(reopened.prepare('SELECT value FROM sample WHERE id=1').get().value,'original');
  reopened.close();
});

test('simulated SQLITE_FULL rolls back the entire write transaction without partial rows',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'mps-p127-full-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'full.sqlite');
  const db=open(file);
  db.exec('PRAGMA page_size=1024; PRAGMA journal_mode=WAL; CREATE TABLE payloads(id INTEGER PRIMARY KEY, value TEXT NOT NULL); PRAGMA max_page_count=2;');
  db.exec('BEGIN IMMEDIATE');
  assert.throws(()=>db.prepare('INSERT INTO payloads(value) VALUES(?)').run('x'.repeat(12000)),/full|disk is full/i);
  db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payloads').get().n,0);
  assert.equal(integrity(db),'ok');
  db.close();
  const reopened=open(file);
  assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM payloads').get().n,0);
  assert.equal(integrity(reopened),'ok');
  reopened.close();
});

test('corrupted database copy fails closed while the original database remains healthy',async t=>{
  const {dir,file}=await fixture(t);
  const corrupt=path.join(dir,'corrupt-copy.sqlite');
  await copyFile(file,corrupt);
  const bytes=await readFile(corrupt);
  bytes[0]=0;
  await writeFile(corrupt,bytes);
  const damaged=open(corrupt);
  let detected=false;
  try {
    const result=integrity(damaged);
    detected=result!=='ok';
  } catch(error) {
    detected=/not a database|malformed|corrupt/i.test(String(error?.message||error));
  } finally { damaged.close(); }
  assert.equal(detected,true,'corrupt copy must be rejected by integrity check or SQLite read error');
  const healthy=open(file);
  assert.equal(integrity(healthy),'ok');
  assert.equal(healthy.prepare('SELECT value FROM sample WHERE id=1').get().value,'original');
  healthy.close();
});

test('integrity failure does not silently trigger automatic overwrite or repair of the damaged copy',async t=>{
  const {dir,file}=await fixture(t);
  const corrupt=path.join(dir,'preserve-corrupt.sqlite');
  await copyFile(file,corrupt);
  const bytes=await readFile(corrupt);
  bytes[0]=0;
  await writeFile(corrupt,bytes);
  const before=await readFile(corrupt);
  const db=open(corrupt);
  assert.throws(()=>db.prepare('SELECT * FROM sample').all(),/not a database|malformed|corrupt/i);
  db.close();
  assert.deepEqual(await readFile(corrupt),before);
  const source=open(file);
  assert.equal(integrity(source),'ok');
  source.close();
});
