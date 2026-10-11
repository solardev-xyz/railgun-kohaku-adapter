"use strict";
const { NOTE_MAX, LEGACY_MAX } = require("../src/amount-bounds");
const privateFixture=require("./fixtures/railgun-kohaku-private-conformance");
const publicFixture=require("./fixtures/railgun-kohaku-public-conformance");
const cases=[
 ["private",()=>privateFixture.independentPrivateHost(), require("../src/railgun-kohaku-private-adapter").createRailgunKohakuPrivateAdapter,"prepareTransfer",privateFixture.INSTANCE],
 ["public",()=>publicFixture.independentPublicHost(),require("../src/railgun-kohaku-public-adapter").createRailgunKohakuPublicAdapter,"prepareShield",publicFixture.INSTANCE],
];
test.each(cases)("%s ceiling is captured and doesn't alter read visibility",async(_name,fixture,create,method,recipient)=>{
 const f=fixture(),controller=new AbortController(),options={host:f.host,signal:controller.signal,maxAmount:LEGACY_MAX+1n};
 let captured;
 f.host[method]=async(value)=>{captured=value;return {handle:Object.freeze({})};};
 const adapter=create(options);options.maxAmount=1n;
 await adapter[method]({...f.input,amount:LEGACY_MAX+1n},recipient);
 expect(captured.amount).toBe(LEGACY_MAX+1n);
 adapter.close();await adapter.closed;
 const small=fixture(),read=create({host:small.host,signal:new AbortController().signal,maxAmount:1n});
 expect((await read.notes())[0].amount).toBe(2000n);
 await expect(read[method]({...small.input,amount:2n},recipient)).rejects.toThrow();
 read.close();await read.closed;
});
test.each(cases)("%s refuses invalid explicit maxima without getter or proxy execution",(_name,fixture,create)=>{
 for(const maxAmount of [undefined,0n,-1n,NOTE_MAX+1n,1,"1"]){
  const f=fixture();expect(()=>create({host:f.host,signal:new AbortController().signal,maxAmount})).toThrow();f.host.close();
 }
 const getter=jest.fn(()=>NOTE_MAX),trap=jest.fn();
 const f=fixture(),options={host:f.host,signal:new AbortController().signal};
 Object.defineProperty(options,"maxAmount",{enumerable:true,get:getter});expect(()=>create(options)).toThrow();
 expect(()=>create(new Proxy({}, {getPrototypeOf:trap,getOwnPropertyDescriptor:trap}))).toThrow();
 expect(getter).not.toHaveBeenCalled();expect(trap).not.toHaveBeenCalled();f.host.close();
});
