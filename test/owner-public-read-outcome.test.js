"use strict";
require("../tools/owner-test-staging/context-host.cjs");
let endpoint;
const request = jest.fn();
jest.mock("../src/owners/host-bindings", () => ({
  ...jest.requireActual("../src/owners/host-bindings"),
  transport: { createWalletTorTransport: () => ({request, close() {}}) },
  tor: {getWalletSocksEndpoint: () => endpoint},
  settings: {isWalletTorExperimentAvailable: () => true},
}));
const {createPrivacyScope} = require("../src/owners/context-bindings");
const {createRailgunPublicServices} = require("../src/owners/railgun-public-services");
const {createRailgunTxidRootSource} = require("../src/owners/railgun-txid-root");
const {readPublicReadFailure, carryPublicReadFailure} = require("../src/owners/public-read-outcome");
let scope, handle, services, root;
const point = {index:2,root:"1".repeat(64)};
beforeEach(() => {
  request.mockReset(); endpoint = {signal:new AbortController().signal};
  scope = createPrivacyScope({profileId:"outcome-test", signal:new AbortController().signal});
  handle = scope.getContext({kind:"service",principal:"railgun-public-sync",protocol:"railgun",deployment:"sepolia",chainId:11155111,role:"public-services"});
});
afterEach(() => { services?.close(); root?.close(); services=root=null; scope.close(); jest.restoreAllMocks(); });
const transportError = (category="connection") => Object.assign(Error("not exposed"), {code:"TOR_REQUEST_FAILED",failureCategory:category});
const capture = async work => { try {await work; throw Error("expected refusal");} catch(error) {return error;} };
function reply(_h,_u,options) {
  const input = JSON.parse(options.body);
  return {status:200,body:Buffer.from(JSON.stringify({jsonrpc:"2.0",id:input.id,result:input.method === "ppoi_validated_txid" ? {validatedTxidIndex:2,validatedTxidMerkleroot:point.root} : true}))};
}
test.each(["latestTxid", "txidPage", "validateTxidRoot"])("actual %s transport catch registers only closed provenance", async method => {
  services=createRailgunPublicServices(handle); request.mockRejectedValueOnce(transportError());
  const error=await capture(services[method](...(method==="validateTxidRoot" ? [{tree:0,...point}] : [])));
  expect(error.code).toBe("RAILGUN_PUBLIC_SERVICE_REFUSED");
  expect(readPublicReadFailure(error)).toEqual({schema:"railgun-public-read-failure-v1",operation:"txid-sync",category:"connection"});
  expect(Object.keys(error)).toEqual(["code"]);
  expect(readPublicReadFailure({...error})).toBeNull();
});
test.each(["connection","timeout"])("root masking preserves actual %s provenance", async category => {
  root=createRailgunTxidRootSource(handle); request.mockRejectedValueOnce(transportError(category));
  const error=await capture(root.acquire(point));
  expect(error.code).toBe("RAILGUN_TXID_ROOT_REFUSED");
  expect(readPublicReadFailure(error)?.category).toBe(category);
});
test("a later validation call failure has the same provenance without trusting error fields downstream", async () => {
  root=createRailgunTxidRootSource(handle); request.mockImplementationOnce(reply).mockRejectedValueOnce(transportError("timeout"));
  expect(readPublicReadFailure(await capture(root.acquire(point)))?.category).toBe("timeout");
});
test.each(["tls","protocol","response","unknown","cancelled",undefined])("category %s is ineligible", async category => {
  services=createRailgunPublicServices(handle);
  const error=transportError(); error.failureCategory=category; request.mockRejectedValueOnce(error);
  expect(readPublicReadFailure(await capture(services.latestTxid()))).toBeNull();
});
test.each(["non200","rpc-error","json","null","false","wrong-root"])("%s is never transport provenance", async kind => {
  root=createRailgunTxidRootSource(handle);
  request.mockImplementation((h,u,o) => {
    const response=reply(h,u,o), body=JSON.parse(response.body);
    if(kind==="non200") response.status=503;
    if(kind==="json") response.body=Buffer.from("not JSON");
    else { if(kind==="rpc-error") {delete body.result;body.error={code:-32602};}
      if(kind==="null") body.result=null;
      if(kind==="false" && JSON.parse(o.body).method!=="ppoi_validated_txid") body.result=false;
      if(kind==="wrong-root") body.result.validatedTxidMerkleroot="2".repeat(64);
      response.body=Buffer.from(JSON.stringify(body)); }
    return response;
  });
  expect(readPublicReadFailure(await capture(root.acquire(point)))).toBeNull();
});
test.each(["scope","endpoint"])("%s revocation racing a transport failure disqualifies", async kind => {
  services=createRailgunPublicServices(handle);
  request.mockImplementation(() => {if(kind==="scope") scope.close(); else endpoint={signal:new AbortController().signal};throw transportError();});
  expect(readPublicReadFailure(await capture(services.latestTxid()))).toBeNull();
});
test("unregistered errors and hostile accessors cannot gain provenance", async () => {
  const error=transportError(), target=Error();
  expect(carryPublicReadFailure(error,target)).toBe(target);
  expect(readPublicReadFailure(target)).toBeNull();
  services=createRailgunPublicServices(handle);
  Object.defineProperty(error,"failureCategory",{get(){throw Error("must not read");}});
  request.mockRejectedValueOnce(error);
  expect(readPublicReadFailure(await capture(services.latestTxid()))).toBeNull();
});
