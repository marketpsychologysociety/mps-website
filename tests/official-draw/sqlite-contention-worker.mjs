import { access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { SQLiteTransactionalStore } from './sqlite-transactional-store.mjs';

const input = JSON.parse(process.env.MPS_SQLITE_WORKER_INPUT || '{}');
const store = new SQLiteTransactionalStore(input.file);
try {
  if (input.waitForGate) {
    process.stdout.write('READY\\n');
    const deadline = Date.now() + 15000;
    while (true) {
      try { await access(input.waitForGate); break; }
      catch { if (Date.now() > deadline) throw new Error('GATE_TIMEOUT'); await delay(10); }
    }
  }
  const result = store.execute(input.request);
  process.stdout.write(JSON.stringify(result) + '\\n');
} finally {
  store.close();
}
