import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const required=["CRM_CERT_BASE_URL","CRM_CERT_OWNER_EMAIL","CRM_CERT_OWNER_PASSWORD","CRM_CERT_LENDER_EMAIL","CRM_CERT_LENDER_PASSWORD"];
for(const name of required)if(!process.env[name])throw new Error(`Missing ${name}.`);
const baseUrl=new URL(process.env.CRM_CERT_BASE_URL).origin;
const chrome=process.env.CHROME_BIN??"google-chrome";

async function waitForJson(url,attempts=100){
  for(let attempt=0;attempt<attempts;attempt+=1){try{const response=await fetch(url);if(response.ok)return response.json();}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error("Chrome DevTools endpoint did not become ready.");
}

async function withBrowser(run){
  const profile=await mkdtemp(join(tmpdir(),"buddy-crm-cert-")),port=9222+Math.floor(Math.random()*500);
  const child=spawn(chrome,["--headless=new","--no-sandbox","--disable-gpu",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"about:blank"],{stdio:"ignore"});
  try{
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const page=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:"PUT"}).then(response=>response.json());
    const socket=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let sequence=0;
    await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
    socket.addEventListener("message",event=>{const message=JSON.parse(String(event.data));if(!message.id)return;const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);if(message.error)entry.reject(new Error(message.error.message));else entry.resolve(message.result);});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const result=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;};
    const navigate=async url=>{await send("Page.navigate",{url});for(let attempt=0;attempt<200;attempt+=1){const ready=await evaluate("document.readyState === 'complete'");if(ready)return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Navigation timed out: ${url}`);};
    await send("Page.enable");await send("Runtime.enable");await run({evaluate,navigate});socket.close();
  }finally{child.kill("SIGTERM");await rm(profile,{recursive:true,force:true});}
}

async function certifyRole(role,email,password){
  await withBrowser(async({evaluate,navigate})=>{
    await navigate(`${baseUrl}/login`);
    const result=await evaluate(`(()=>{const email=document.querySelector('input[name="email"]'),password=document.querySelector('input[name="password"]');if(!email||!password)return 'missing-form';email.value=${JSON.stringify(email)};password.value=${JSON.stringify(password)};email.form.requestSubmit();return 'submitted';})()`);
    if(result!=="submitted")throw new Error(`${role} login form unavailable.`);
    for(let attempt=0;attempt<200;attempt+=1){const href=await evaluate("location.href");if(href.startsWith(`${baseUrl}/app`))break;if(attempt===199)throw new Error(`${role} authentication did not reach the application.`);await new Promise(resolve=>setTimeout(resolve,100));}
    const views={home:"CRM Workspace",companies:"Companies",people:"People",relationships:"Relationships",opportunities:"Opportunities",activities:"Activities",referrals:"Referrals",calendar:"Appointments",tasks:"Tasks",insights:"Insights",reports:"Operating report"};
    for(const[view,expected]of Object.entries(views)){
      await navigate(`${baseUrl}/app/crm?view=${view}`);
      const state=await evaluate(`({href:location.href,text:document.body.innerText,errors:document.querySelectorAll('[role="alert"],.operation-error').length})`);
      if(!state.href.includes("/app/crm")||!state.text.includes(expected)||state.errors)throw new Error(`${role} CRM ${view} verification failed.`);
    }
    const controls=await evaluate("document.body.innerText");
    if(!controls.includes("Governed CRM operations")||!controls.includes("Search operation selectors"))throw new Error(`${role} governed operating controls unavailable.`);
  });
}

await certifyRole("owner",process.env.CRM_CERT_OWNER_EMAIL,process.env.CRM_CERT_OWNER_PASSWORD);
await certifyRole("lender",process.env.CRM_CERT_LENDER_EMAIL,process.env.CRM_CERT_LENDER_PASSWORD);
console.log(JSON.stringify({event:"crm.authenticated_browser_certified",baseUrl,roles:["owner","lender"],occurredAt:new Date().toISOString()}));
