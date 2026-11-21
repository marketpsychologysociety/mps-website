import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../rebuild/v4.8.1/Index.html', import.meta.url), 'utf8');
const routeSource = html.match(/function go\(id\)\s*\{[\s\S]*?window\.scrollTo\([^;]*;\s*\}/)?.[0];
assert.ok(routeSource, 'go(id) navigation function must exist');

function harness(session) {
  const pages = ['home','register','deposit','member','learning','pulse','calculator','vip','news','advertise','admin','adminDashboard'];
  const state = Object.fromEntries(pages.map(id => [id, false]));
  const elements = pages.map(id => ({
    id,
    classList: { toggle(name, active) { if (name === 'active') state[id] = active; } }
  }));
  const context = {
    adminSession: session,
    document: { querySelectorAll(selector) { assert.equal(selector, '.page'); return elements; } },
    window: { scrollTo() {} }
  };
  vm.createContext(context);
  vm.runInContext(routeSource, context);
  return { context, state };
}

test('authenticated Admin can leave and return from every public menu without a new login', () => {
  const { context, state } = harness('admin-session-test');
  const publicMenus = ['home','register','deposit','member','learning','pulse','calculator','vip','news','advertise'];
  for (const menu of publicMenus) {
    context.go(menu);
    assert.equal(context.adminSession, 'admin-session-test', 'navigation must not clear the Admin session');
    context.go('admin');
    assert.equal(state.adminDashboard, true, 'Admin menu must return to the existing dashboard');
    assert.equal(state.admin, false, 'Admin login page must not replace an active dashboard');
    assert.equal(context.adminSession, 'admin-session-test');
  }
});

test('Admin menu without a session still opens the login page', () => {
  const { context, state } = harness('');
  context.go('admin');
  assert.equal(state.admin, true);
  assert.equal(state.adminDashboard, false);
});

test('explicit logout clears the Admin session; navigation itself does not', () => {
  const logout = html.match(/async function adminLogout\(\)\s*\{[^}]*\}/)?.[0];
  assert.ok(logout, 'adminLogout must exist');
  assert.match(logout, /adminSession\s*=\s*''/);
  assert.doesNotMatch(routeSource, /adminSession\s*=\s*''/);
});
