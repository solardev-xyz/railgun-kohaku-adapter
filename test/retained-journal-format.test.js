"use strict";
const { Interface } = require("ethers");
const data = require("../host-journal-data.cjs");
const { NOTE_MAX, LEGACY_MAX } = require("../src/amount-bounds");
const { widePrivateFixture } = require("./fixtures/wide-private-capsule-data");
const { fixture } = require("./fixtures/railgun-journal-transact-data");
const pins = require("../src/railgun-shield-pins.json");
const receiptPolicy = require("../src/owners/railgun-transact-receipt-policy");
const H = "0x" + "a".repeat(64), B = "0x" + "b".repeat(64);
function privateIntent(kind, input = NOTE_MAX, publicAmount = NOTE_MAX - 1n) {
  const f = widePrivateFixture(kind, input, publicAmount);
  return data.railgunTransactJournalIntent({ ...f.capsule.preparation.transaction, from: "0x" + "34".repeat(20) });
}
function resolution(intent) {
  const partial = intent.operation === "railgun-partial-unshield";
  const amount = BigInt(partial ? intent.unshieldAmount : intent.amount);
  const fee = amount * 25n / 10000n;
  const unshield = { kind: "unshield", logIndex: "0x8", recipient: intent.recipient, token: pins.wrappedNative,
    [partial ? "unshieldAmount" : "amount"]: String(amount), received: String(amount-fee), fee: String(fee), feeDeviation: false,
    ...(partial ? { treasury: receiptPolicy.treasury, recipientTransferLogIndex: "0x6", treasuryTransferLogIndex: "0x7" } : {}) };
  const record = { hash: H, intent, observation: { status: "included", blockNumber: 16, blockHash: B } };
  const value = { outcome: "matched", finalizedBlockNumber: 16, finalizedBlockHash: B, transact: {
    ...(intent.version === undefined ? {} : { version: intent.version }),
    ...(partial ? { receiptPolicy: receiptPolicy.id } : {}),
    status: "matched", transactionHash: H, blockHash: B, blockNumber: "0x10", operation: intent.operation,
    inputTree: intent.tree, nullifier: intent.nullifier,
    ...(partial ? { changeCommitment: intent.changeCommitment, unshieldCommitment: intent.unshieldCommitment } : { commitment: intent.commitment }),
    boundParamsHash: intent.boundParamsHash, intentDigest: intent.intentDigest, nullifiedLogIndex: "0x5",
    output: partial ? { kind: "partial-unshield", change: { kind: "shielded", tree: 0, position: 1, logIndex: "0x9" }, unshield } : unshield,
    trust: "unverified-rpc", spendingEnabled: false,
  } };
  return { record, value, unshield };
}
test.each([["railgun-token-unshield",3], ["railgun-partial-unshield",4]])("wide %s journal and resolution have canonical versions", (kind,version) => {
  const intent = privateIntent(kind);
  expect(intent.version).toBe(version);
  expect(data.validRailgunTransactIntent(intent)).toBe(true);
  for (const v of [undefined,1,2,3,4,5].filter(v=>v!==version)) {
    const bad = { ...intent, version:v }; if(v===undefined) delete bad.version;
    expect(data.validRailgunTransactIntent(bad)).toBe(false);
  }
  const {record,value,unshield}=resolution(intent);
  expect(data.validRailgunTransactResolution(value,record)).toBe(true);
  expect(data.validRailgunTransactResolution({...value,transact:{...value.transact,version:2}},record)).toBe(false);
  unshield.received=String(BigInt(unshield.received)+1n);
  expect(data.validRailgunTransactResolution(value,record)).toBe(false);
  unshield.received=String(BigInt(unshield.received)-1n);
  data.freezeRailgunTransactResolution(value);
  expect(Object.isFrozen(unshield)).toBe(true);
});
test("a wide input with a small public unshield remains a v2 journal",()=>{
  const intent=privateIntent("railgun-partial-unshield",NOTE_MAX,1000n);
  expect(intent.version).toBe(2);
  expect(data.validRailgunTransactIntent(intent)).toBe(true);
  expect(intent).not.toHaveProperty("inputAmount");
  const r=resolution(intent); expect(data.validRailgunTransactResolution(r.value,r.record)).toBe(true);
});
test("private transfer journals reveal no input amount or format version",()=>{
  const intent=privateIntent("railgun-private-transfer");
  expect(intent).not.toHaveProperty("version"); expect(intent).not.toHaveProperty("amount");
  expect(data.validRailgunTransactIntent(intent)).toBe(true);
  expect(data.validRailgunTransactIntent({...intent,version:3})).toBe(false);
});
test("small and oversized public amounts cannot be relabelled wide",()=>{
  const old=data.railgunTransactJournalIntent(fixture(true).transaction());
  expect(data.validRailgunTransactIntent({...old,version:3})).toBe(false);
  const wide=privateIntent("railgun-token-unshield");
  for(const amount of [String(NOTE_MAX+1n),String(LEGACY_MAX),"01","0","-1"])
    expect(data.validRailgunTransactIntent({...wide,amount})).toBe(false);
});
const prepared=require("./fixtures/railgun-journal-shield-prepared.json");
const {SHIELD_ABI, validateRailgunNativeShield}=require("../src/owners/railgun-shield-policy");
function shield(amount) {
 const abi=new Interface(SHIELD_ABI);
 const [,calls]=abi.decodeFunctionData("multicall",prepared.data);
 const [requests]=abi.decodeFunctionData("shield",calls[1].data);
 const request=requests[0].toObject(true);
 request.preimage.value=amount;
 const data=abi.encodeFunctionData("multicall",[true,[
  [pins.relayAdapt,abi.encodeFunctionData("wrapBase",[amount]),0],
  [pins.relayAdapt,abi.encodeFunctionData("shield",[[request]]),0],
 ]]);
 return {chainId:pins.chainId,to:pins.relayAdapt,value:String(amount),data};
}
test("wide Shield journals are explicit v2; legacy admission remains closed",()=>{
 const tx=shield(NOTE_MAX),binding=data.shieldIntentBinding(tx);
 expect(binding.version).toBe(2);
 const intent={kind:"railgun-native-shield",digest:H,...binding};
 expect(data.validShieldIntent(intent)).toBe(true);
 const missing={...intent};delete missing.version;
 expect(data.validShieldIntent(missing)).toBe(false);
 expect(data.validShieldIntent({...intent,amount:String(LEGACY_MAX)})).toBe(false);
 expect(()=>validateRailgunNativeShield(tx,{amount:tx.value,npk:binding.npk})).toThrow();
});
test("genuine legacy readers accept legacy data and refuse wide versions or downgrades",()=>{
 const old=require("./fixtures/legacy-journal-formats/railgun-transact-intent");
 const oldShield=require("./fixtures/legacy-journal-formats/railgun-shield-intent");
 expect(old.validRailgunTransactIntent(data.railgunTransactJournalIntent(fixture(true).transaction()))).toBe(true);
 for(const kind of ["railgun-token-unshield","railgun-partial-unshield"]) {
  const intent=privateIntent(kind);expect(old.validRailgunTransactIntent(intent)).toBe(false);
  const downgraded={...intent};if(kind==="railgun-token-unshield")delete downgraded.version;else downgraded.version=2;
  expect(old.validRailgunTransactIntent(downgraded)).toBe(false);
 }
 const binding=data.shieldIntentBinding(shield(NOTE_MAX)), intent={kind:"railgun-native-shield",digest:H,...binding};
 expect(oldShield.validShieldIntent(intent)).toBe(false);delete intent.version;
 expect(oldShield.validShieldIntent(intent)).toBe(false);
});
test("legacy reader fixtures reverse to committed bytes with import relocations only",()=>{
 const fs=require("node:fs"),path=require("node:path"),{createHash}=require("node:crypto");
 const manifest=require("../docs/owners/JOURNAL-FORMATS-TRANSITIONS.json");
 for(const n of ["transact-intent","transact-resolution","shield-intent","shield-resolution"]) {
  const file=`railgun-${n}.js`;
  const text=fs.readFileSync(path.join(__dirname,"fixtures/legacy-journal-formats",file),"utf8")
   .replaceAll("require('../../../src/deployment')","require('../deployment')")
   .replaceAll('require("../../../src/data/','require("../data/')
   .replaceAll('require("../../../src/railgun-shield-pins.json")','require("../railgun-shield-pins.json")')
   .replaceAll('require("../../../src/owners/railgun-transact-receipt-policy.js")','require("./railgun-transact-receipt-policy.js")')
   .replaceAll('require("../../../src/owners/railgun-shield-policy.js")','require("./railgun-shield-policy.js")');
  expect(createHash("sha256").update(text).digest("hex")).toBe(manifest.changes.find(r=>r.file===`src/owners/${file}`).beforeSha256);
 }
});
test("wide Shield settlement is version-bound and conserves the authenticated gross amount",()=>{
 const binding=data.shieldIntentBinding(shield(NOTE_MAX));
 const intent={kind:"railgun-native-shield",digest:H,...binding};
 const record={intent,hash:H,observation:{status:"included",blockNumber:16,blockHash:B}};
 const value={outcome:"matched",finalizedBlockNumber:16,finalizedBlockHash:B,shield:{
  version:2,status:"matched",transactionHash:H,blockHash:B,blockNumber:"0x10",logIndex:"0x5",tree:0,position:1,
  npk:binding.npk,token:binding.token,amount:binding.amount,noteValue:binding.noteValue,
  fee:String(NOTE_MAX-BigInt(binding.noteValue)),feeDeviation:false,trust:"unverified-rpc",spendingEnabled:false,
 }};
 expect(data.validRailgunShieldResolution(value,record)).toBe(true);
 const missing={...value.shield};delete missing.version;
 expect(data.validRailgunShieldResolution({...value,shield:missing},record)).toBe(false);
 expect(data.validRailgunShieldResolution({...value,shield:{...value.shield,fee:"0"}},record)).toBe(false);
 expect(data.validRailgunShieldResolution(value,{...record,intent:{...intent,version:1}})).toBe(false);
});
test.each(["railgun-token-unshield","railgun-partial-unshield"])("actual wide %s receipt produces the corresponding resolution version",kind=>{
 const partial=kind==="railgun-partial-unshield";
 const f=widePrivateFixture(kind,NOTE_MAX,NOTE_MAX-1n), original={...f.capsule.preparation.transaction,from:"0x"+"34".repeat(20)};
 const intent=data.railgunTransactJournalIntent(original);
 const {PRIVATE_EVENTS,inspectRailgunTransactReceipt:inspect}=require("../src/owners/railgun-transact-receipt");
 const {TRANSACT_ABI}=require("../src/data/railgun-private-policy");
 const abi=new Interface([TRANSACT_ABI,...PRIVATE_EVENTS,"event Transfer(address indexed from,address indexed to,uint256 value)"]);
 const amount=BigInt(intent.unshieldAmount??intent.amount),fee=amount*25n/10000n;
 const tx={...original,chainId:"0xaa36a7",value:"0x0",hash:H,nonce:"0x3",input:original.data,blockHash:B,blockNumber:"0x10",transactionIndex:"0x0"};
 const record={hash:H,nonce:3,intent};
 const events=[['Nullified',[f.inner.boundParams.treeNumber,f.inner.nullifiers],pins.proxy],
  ...(partial ? [['Transfer',[pins.proxy,intent.recipient,amount-fee],pins.wrappedNative],['Transfer',[pins.proxy,receiptPolicy.treasury,fee],pins.wrappedNative]]:[]),
  ['Unshield',[intent.recipient,[0,pins.wrappedNative,0],amount-fee,fee],pins.proxy],
  ...(partial ? [['Transact',[0,1,[f.inner.commitments[0]],f.inner.boundParams.commitmentCiphertext],pins.proxy]]:[])];
 const logs=events.map(([name,args,address],i)=>({...abi.encodeEventLog(name,args),address,transactionHash:H,blockHash:B,blockNumber:"0x10",transactionIndex:"0x0",logIndex:'0x'+(5+i).toString(16),removed:false}));
 const receipt={status:"0x1",transactionHash:H,from:tx.from,to:pins.proxy,blockHash:B,blockNumber:"0x10",transactionIndex:"0x0",logs};
 const result=inspect(record,tx,receipt);
 expect(result).toMatchObject({status:"matched",version:partial?4:3});
 expect(data.validRailgunTransactResolution({outcome:"matched",finalizedBlockNumber:16,finalizedBlockHash:B,transact:result},{...record,observation:{status:"included",blockNumber:16,blockHash:B}})).toBe(true);
});
test("Shield factories and legacy falsy results keep closed contracts",()=>{
 const {createShieldPolicy}=require("../src/owners/railgun-shield-policy-core");
 for(const value of [undefined,1n,0n,NOTE_MAX+1n,"10000000000000000"])
  expect(()=>createShieldPolicy(value)).toThrow();
 expect(data.validShieldIntent(null)).toBeNull();
 expect(data.validShieldIntent(undefined)).toBeUndefined();
});
test("historical Shield intent remains valid through the archived-row host checks",()=>{
 const old=require("./fixtures/legacy-journal-formats/railgun-shield-intent");
 const intent={kind:"railgun-native-shield",digest:prepared.digest,...old.shieldIntentBinding(prepared)};
 const railgun={outcome:"matched",finalizedBlockNumber:16,finalizedBlockHash:B,shield:{
  status:"matched",transactionHash:H,blockHash:B,blockNumber:"0x10",logIndex:"0x5",tree:0,position:1,
  npk:intent.npk,token:intent.token,amount:intent.amount,noteValue:intent.noteValue,
  fee:String(BigInt(intent.amount)-BigInt(intent.noteValue)),feeDeviation:false,trust:"unverified-rpc",spendingEnabled:false,
 }};
 const row={hash:H,nonce:0,intent,status:"included",blockNumber:16,blockHash:B,archivedAt:1,
  finalized:{blockNumber:16,blockHash:B},railgun};
 const retention=require("../tools/owner-test-staging/fixtures/host/src/main/wallet/privacy-journal-retention");
 expect(old.validShieldIntent(intent)).toBe(true);
 expect(data.validShieldIntent(intent)).toBe(true);
 expect(retention.validArchive([row],"public")).toBe(true);
 expect(retention.validArchive([{...row,intent:{kind:"railgun-native-shield"}}],"public")).toBe(false);
});
test.each([["railgun-token-unshield","railgun-transact-v3"],["railgun-partial-unshield","railgun-transact-v4"]])("wide %s uses its fixed public digest domain",(kind,domain)=>{
 const f=widePrivateFixture(kind,NOTE_MAX,NOTE_MAX-1n);
 const tx={...f.capsule.preparation.transaction,from:"0x"+"34".repeat(20)};
 const {AbiCoder,keccak256}=require("ethers");
 const expected=keccak256(AbiCoder.defaultAbiCoder().encode(["string","uint256","address","address","uint256","bytes"],[domain,tx.chainId,tx.from,tx.to,tx.value,tx.data]));
 expect(data.railgunTransactJournalIntent(tx).digest).toBe(expected);
});
