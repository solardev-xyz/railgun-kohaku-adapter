"use strict";
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { parseOwnerInputs } = require("../tools/conformance/reference-owner-inputs.cjs");
function fixture() {
  const app = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "reference-owner-input-")));
  fs.mkdirSync(path.join(app,"node_modules/@freedom/railgun-kohaku-adapter"),{recursive:true});
  fs.writeFileSync(path.join(app,"node_modules/@freedom/railgun-kohaku-adapter/package.json"),'{}');
  fs.writeFileSync(path.join(app,"package.json"),JSON.stringify({name:"railgun-kohaku-reference-wallet"}));
  return app;
}
test("an explicit installed app is selected without creating or opening profile state", () => {
  const app=fixture(), before=fs.readdirSync(app);
  expect(parseOwnerInputs(["--app",app,"/engine","/prover","/artifacts","reopen","/fixture"]))
    .toEqual({application:app,archive:"/engine",proverArchive:"/prover",artifactDirectory:"/artifacts",mode:"reopen",priorRoot:"/fixture"});
  expect(fs.readdirSync(app)).toEqual(before);
});
test("source-host mode stays explicit in the returned application path",()=>{
  expect(parseOwnerInputs(["/engine","/prover","/artifacts"]).application)
    .toBe(path.resolve(__dirname,"../examples/reference-wallet"));
});
test("missing, relative, malformed or unrelated app selections fail before fixture creation",()=>{
  const app=fixture();
  for(const args of [["--app"],["--app","relative","/e","/p","/a"],["--unknown","/e","/p","/a"],["/e","/p"],["/e","/p","/a","account","/root","extra"]])
    expect(()=>parseOwnerInputs(args)).toThrow();
  fs.writeFileSync(path.join(app,"package.json"),JSON.stringify({name:"another-app"}));
  expect(()=>parseOwnerInputs(["--app",app,"/e","/p","/a"])).toThrow("Installed reference application required");
});

test("symlink, file and missing-adapter selections refuse", () => {
  const app=fixture(), parent=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"reference-owner-links-")));
  const link=path.join(parent,"link"); fs.symlinkSync(app,link,"dir");
  expect(()=>parseOwnerInputs(["--app",link,"/e","/p","/a"])).toThrow();
  expect(()=>parseOwnerInputs(["--app",path.join(app,"package.json"),"/e","/p","/a"])).toThrow();
  fs.writeFileSync(path.join(parent,"package.json"),JSON.stringify({name:"railgun-kohaku-reference-wallet"}));
  expect(()=>parseOwnerInputs(["--app",parent,"/e","/p","/a"])).toThrow("Installed reference application required");
});
