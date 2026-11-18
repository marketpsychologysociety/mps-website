import { access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';

const input = JSON.parse(process.env.MPS_SQLITE_BOUNDARY_INPUT || '{}');
const db = new DatabaseSync(input.file);
db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');

async function waitForGate(file) {
  const deadline = Date.now() + 15000;
  while (true) {
    try { await access(file); return; }
    catch { if (Date.now() > deadline) throw new Error('GATE_TIMEOUT'); await delay(10); }
  }
}

try {
  if (input.mode === 'hold-write-lock') {
    db.exec('BEGIN IMMEDIATE');
    process.stdout.write('READY\n');
    await waitForGate(input.releaseGate);
    db.exec('COMMIT');
    process.stdout.write('DONE\n');
  } else if (input.mode === 'reader-snapshot') {
    db.exec('BEGIN');
    const before = db.prepare('SELECT value FROM sample WHERE id=1').get().value;
    process.stdout.write('READY\n');
    await waitForGate(input.releaseGate);
    const during = db.prepare('SELECT value FROM sample WHERE id=1').get().value;
    db.exec('COMMIT');
    const after = db.prepare('SELECT value FROM sample WHERE id=1').get().value;
    process.stdout.write(JSON.stringify({ before, during, after }) + '\n');
  } else {
    throw new Error('UNKNOWN_WORKER_MODE');
  }
} finally {
  db.close();
}
