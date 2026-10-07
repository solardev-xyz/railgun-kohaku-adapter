import * as data from "../../types/host-journal-data.js";
const intent = data.railgunTransactJournalIntent({});
const accepted: boolean = data.validRailgunTransactIntent(intent);
const target: boolean = data.isRailgunTarget("0x12");
if (intent.operation === "railgun-partial-unshield") {
  const version: 2 = intent.version;
  const amount: string = intent.unshieldAmount;
  void version;
  void amount;
}
// @ts-expect-error journal metadata is readonly
intent.digest = "changed";
// @ts-expect-error historical truthiness is not a boolean/type-guard promise
const shieldBoolean: boolean = data.validShieldIntent(null);
const frozen = data.freezeRailgunShieldResolution({ shield: null });
// @ts-expect-error freeze returns top-level readonly data
frozen.shield = null;
const binding = data.shieldIntentBinding({});
binding.npk = "still mutable";
const resolution: boolean = data.validRailgunTransactResolution({}, {});
const shieldResolution: unknown = data.validRailgunShieldResolution({}, {});
data.freezeRailgunTransactResolution({ transact: null });
// @ts-expect-error the original freeze input is an object, not null
data.freezeRailgunShieldResolution(null);
// @ts-expect-error live authority is not part of the data entry
data.assertRailgunPrivateSubmission({});
void accepted;
void target;
void shieldBoolean;
void resolution;
void shieldResolution;
