// Negative: unshield options must be omitted or {}; tailCalls, a 0zk recipient
// and a native input are outside the restricted private contract.
import type { PrivateAdapter, PrivateInput } from '@freedom/railgun-kohaku-adapter';

declare const adapter: PrivateAdapter;
const input: PrivateInput = {
  asset: { __type: 'erc20', contract: '0x1111111111111111111111111111111111111111' },
  amount: 1n,
  noteId: '0:1',
};

export async function misuse(): Promise<void> {
  const recipient = '0x2222222222222222222222222222222222222222';
  await adapter.prepareUnshield(input, recipient, { tailCalls: async () => [] }); // expect TS2322
  await adapter.prepareUnshield(input, '0zk1qexample'); // expect TS2345
  const nativeInput = { asset: { __type: 'native' as const }, amount: 1n, noteId: '0:1' };
  await adapter.prepareTransfer(nativeInput, '0zk1qexample'); // expect TS2345
}
