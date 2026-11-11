import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./isolated-gas-acceptance.gs', import.meta.url), 'utf8');

test('isolated GAS acceptance harness parses as V8 JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'isolated-gas-acceptance.gs' }));
});

test('requires an explicit new-standalone-project confirmation', () => {
  assert.match(source, /confirmation !== MPS_V480_ISOLATED_CONFIRMATION_/);
  assert.match(source, /I_CONFIRM_THIS_IS_A_NEW_STANDALONE_TEST_PROJECT/);
});

test('fails closed when MPS spreadsheet, VIP group, bot token, or webhook secret is configured', () => {
  assert.match(source, /oldSpreadsheetId \|\| oldVipChatId \|\| existingBotToken \|\| existingWebhookSecret/);
});

test('creates its own synthetic spreadsheet and verifies that it is private', () => {
  assert.equal((source.match(/SpreadsheetApp\.create\(/g) || []).length, 1);
  assert.match(source, /MPS_ISOLATED_ACCEPTANCE_/);
  assert.match(source, /getSharingAccess\(\) === DriveApp\.Access\.PRIVATE/);
  assert.doesNotMatch(source, /openById\s*\(/);
});

test('uses the candidate ledger and real candidate VIP transition entry point', () => {
  assert.match(source, /createMpsGasEffectLedger_\(/);
  assert.match(source, /processMpsVipChatMemberEvent_\(/);
});

test('does not invoke Telegram HTTP or moderation helpers', () => {
  assert.doesNotMatch(source, /UrlFetchApp|sendTelegram_|telegramSendToChat_|revokeVipInviteLink_|kickMpsUnauthorizedUser_/);
  assert.match(source, /telegramApiCalls:\s*0/);
});

test('restores the only two Script Properties it changes', () => {
  const writes = [...source.matchAll(/props\.setProperty\('([^']+)'/g)].map(match => match[1]);
  assert.deepEqual([...new Set(writes)].sort(), ['MPS_SPREADSHEET_ID', 'MPS_TELEGRAM_VIP_CHAT_ID']);
  assert.match(source, /props\.deleteProperty\('MPS_SPREADSHEET_ID'\)/);
  assert.match(source, /props\.deleteProperty\('MPS_TELEGRAM_VIP_CHAT_ID'\)/);
});

test('cleanup trashes only the spreadsheet created by this invocation', () => {
  assert.match(source, /DriveApp\.getFileById\(synthetic\.getId\(\)\)\.setTrashed\(true\)/);
  assert.match(source, /finally\s*\{/);
});

test('contains exactly 20 runtime acceptance assertions', () => {
  assert.equal((source.match(/assert_\(/g) || []).length - 1, 20);
});
