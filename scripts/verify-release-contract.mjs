import {readFileSync} from "node:fs";
const ledger=JSON.parse(readFileSync(new URL("../release/capability-ledger.json",import.meta.url),"utf8"));
const fail=(message)=>{console.error(`RELEASE HOLD: ${message}`);process.exitCode=1};
if(ledger.contractVersion!=="buddy-los-capability-ledger.v1")fail("unknown capability ledger contract");
if(!["PRE_RELEASE","RELEASE_CANDIDATE"].includes(ledger.classification))fail("invalid repository classification");
if(!Array.isArray(ledger.capabilities)||ledger.capabilities.length===0)fail("capability ledger is empty");
const keys=new Set();for(const capability of ledger.capabilities){if(keys.has(capability.key))fail(`duplicate capability ${capability.key}`);keys.add(capability.key);for(const field of ["implemented","deployed","certified","entitled","active"]){if(typeof capability[field]!=="boolean")fail(`${capability.key}.${field} must be boolean`)}if(capability.active&&(!capability.deployed||!capability.certified||!capability.entitled))fail(`${capability.key} is active without deployment, certification, and entitlement`)}
if(ledger.classification==="RELEASE_CANDIDATE"&&ledger.capabilities.some(c=>!c.implemented||!c.certified))fail("release candidate contains uncertified capabilities");
if(!process.exitCode)console.log(`Release contract valid: ${ledger.classification}; ${ledger.capabilities.length} capabilities; activation remains evidence-controlled.`);
