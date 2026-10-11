"use strict";
const { LEGACY_MAX, NOTE_MAX } = require("../src/amount-bounds");
const { widePrivateFixture } = require("./fixtures/wide-private-capsule-data");
function load(options) {
 jest.resetModules();const policy=require("../src/owners/application-policy");
 if(arguments.length)policy.captureRailgunApplicationPolicy(options);else policy.captureRailgunApplicationPolicy();
 return policy;
}
test("omitted fields default independently and inputs are snapshotted",()=>{
 let p=load();expect(p.isRailgunOperationAmount(LEGACY_MAX)).toBe(true);expect(p.isRailgunOperationAmount(LEGACY_MAX+1n)).toBe(false);
 const input={maxOperationAmount:NOTE_MAX};p=load(input);input.maxOperationAmount=1n;
 expect(p.isRailgunOperationAmount(NOTE_MAX)).toBe(true);expect(p.isRailgunGasBudget(2000000000000000n)).toBe(true);
 p=load({maxGasFee:1n});expect(p.isRailgunOperationAmount(LEGACY_MAX)).toBe(true);expect(p.isRailgunGasBudget(2n)).toBe(false);
});
test.each([undefined,0n,-1n,NOTE_MAX+1n,1,"1"])("invalid explicit amount %p poisons capture",value=>{
 jest.resetModules();const p=require("../src/owners/application-policy");
 expect(()=>p.captureRailgunApplicationPolicy({maxOperationAmount:value})).toThrow();
 expect(()=>p.captureRailgunApplicationPolicy()).toThrow();
});
test("direct selection applies the full input ceiling even to a small partial output",()=>{
 const f=widePrivateFixture("railgun-partial-unshield",30000000000000000n,1n);
 load({maxOperationAmount:20000000000000000n});
 expect(()=>require("../src/owners/application-private-preparation").selectRailgunPrivatePreparation(f.owned,f.request)).toThrow();
 load({maxOperationAmount:50000000000000000n});
 expect(require("../src/owners/application-private-preparation").selectRailgunPrivatePreparation(f.owned,f.request)).toEqual(f.capsule.selection);
});
test("raising direct admission never widens legacy relay selection or data formats",()=>{
 const f=widePrivateFixture("railgun-private-transfer",30000000000000000n);
 load({maxOperationAmount:50000000000000000n});
 expect(require("../src/owners/application-private-preparation").selectRailgunPrivatePreparation(f.owned,f.request)).toEqual(f.capsule.selection);
 expect(()=>require("../src/data/railgun-private-preparation").selectRailgunPrivatePreparation(f.owned,f.request)).toThrow();
 expect(()=>require("../src/data/railgun-private-capsule").normalizeRailgunPrivateCapsule(f.capsule)).toThrow();
});
test("a lowered spending policy leaves retained normalization readable",()=>{
 const f=widePrivateFixture("railgun-private-transfer",30000000000000000n);
 load({maxOperationAmount:1n});
 expect(require("../src/data/railgun-retained-private-data").normalizeRailgunPrivateCapsule(f.capsule)).toEqual(f.capsule);
 expect(()=>require("../src/owners/application-private-preparation").selectRailgunPrivatePreparation(f.owned,f.request)).toThrow();
});
test('Shield admission uses gross amount and the captured ceiling',()=>{
 load({maxOperationAmount:50000000000000000n});
 expect(require('../src/owners/application-shield-policy').shieldAmount('30000000000000000')).toBe(30000000000000000n);
 load({maxOperationAmount:5000000000000000n});
 expect(()=>require('../src/owners/application-shield-policy').shieldAmount('8000000000000000')).toThrow();
});
