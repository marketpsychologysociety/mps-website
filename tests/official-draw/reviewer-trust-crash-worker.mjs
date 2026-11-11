import { DurableReviewerTrustRegistry } from './durable-reviewer-trust-registry.mjs';

const [directory, crashStage, encoded] = process.argv.slice(2);
if (!directory || !crashStage || !encoded) process.exit(64);
const args = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
const registry = await DurableReviewerTrustRegistry.open(directory, {
  authorizeAdmin: async () => false,
  lockWaitMs: 2000,
  lockRetryMs: 5,
  testFaultInjector: async (stage, event) => {
    if (event === 'NONCE_CONSUMED' && stage === crashStage) process.exit(73);
  }
});
await registry.verifyAndConsume(args);
await registry.close();
process.exit(0);
