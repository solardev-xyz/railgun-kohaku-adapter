// Negative: the read helpers take their exact shapes. ERC-1155 is not a filter
// asset, an absent filter is null, a projection takes a normalized filter and
// a boolean includeSpent, and dispatch accepts only the three read methods with
// the captured view's own arguments.
import {
  normalizeRailgunKohakuReadFilter,
  projectRailgunKohakuBalance,
  projectRailgunKohakuNotes,
  dispatchRailgunKohakuRead,
} from '@freedom/railgun-kohaku-adapter/read';
import type { ReadDispatchPorts } from '@freedom/railgun-kohaku-adapter/read';
import type { ReadAsset, SnapshotNote } from '@freedom/railgun-kohaku-adapter';

declare const received: SnapshotNote[];
declare const maybe: ReadAsset[] | undefined;
declare const ports: ReadDispatchPorts<{
  view: {
    instanceId(): string;
    balance(assets?: ReadAsset[]): bigint;
    notes(assets?: ReadAsset[], includeSpent?: boolean): string[];
  };
}>;
const TOKEN = '0x1111111111111111111111111111111111111111';

normalizeRailgunKohakuReadFilter([{ __type: 'erc1155', contract: TOKEN, tokenId: 1n }]); // expect TS2769
const keys: ReadonlyArray<string> = normalizeRailgunKohakuReadFilter(maybe); // expect TS2322
projectRailgunKohakuBalance(received, [{ __type: 'native' }]); // expect TS2322
projectRailgunKohakuNotes(received, null); // expect TS2554
projectRailgunKohakuNotes(received, null, 'false'); // expect TS2345
dispatchRailgunKohakuRead(ports, 'prepareTransfer', []); // expect TS2345
dispatchRailgunKohakuRead(ports, 'notes', [undefined, 'yes']); // expect TS2322
export async function misuse(): Promise<void> {
  const total: string = await dispatchRailgunKohakuRead(ports, 'balance', []); // expect TS2322
  void total;
}
void keys;
