import { DOCUMENT_INTELLIGENCE_CONTRACT_VERSION, type DocumentIntelligenceRequest, type DocumentIntelligenceResult } from "./document-intelligence";
import { GoogleAuth } from "google-auth-library";

const TIMEOUT_MS=120_000,RESPONSE_LIMIT=2_000_000;
type ServiceAccountCredentials={client_email:string;private_key:string;project_id?:string};
export type DocumentIntelligenceProviderConfig={endpoint:string;apiKey:string;provider:string;googleServiceAccount:ServiceAccountCredentials|null};
export class DocumentIntelligenceProviderError extends Error { constructor(message:string,readonly retryable:boolean){super(message);} }

export function parseDocumentIntelligenceProviderConfig(env:Record<string,string|undefined>):DocumentIntelligenceProviderConfig|null{
  const endpoint=secureUrl(env.BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_ENDPOINT),apiKey=env.BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_API_KEY?.trim()??"",provider=env.BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_PROVIDER?.trim()??"";
  const googleServiceAccount=parseServiceAccount(env.BUDDY_UNDERWRITER_GOOGLE_SERVICE_ACCOUNT_JSON);
  if(env.BUDDY_UNDERWRITER_GOOGLE_SERVICE_ACCOUNT_JSON?.trim()&&!googleServiceAccount)return null;
  if(endpoint&&new URL(endpoint).hostname.endsWith(".run.app")&&!googleServiceAccount)return null;
  return endpoint&&apiKey.length>=16&&provider.length>=2&&provider.length<=120?{endpoint,apiKey,provider,googleServiceAccount}:null;
}

export async function submitDocumentIntelligence(config:DocumentIntelligenceProviderConfig,request:DocumentIntelligenceRequest,blob:Blob,fetchImpl:typeof fetch=fetch,identityTokenProvider:IdentityTokenProvider=googleIdentityToken):Promise<DocumentIntelligenceResult>{
  const form=new FormData(); form.set("file",blob,`${request.documentVersionId}.document`); form.set("request",JSON.stringify(request));
  const headers:Record<string,string>={Authorization:`Bearer ${config.apiKey}`,"Idempotency-Key":`${request.jobId}:${request.documentVersionId}`,Accept:"application/json"};
  if(config.googleServiceAccount)headers["X-Serverless-Authorization"]=`Bearer ${await identityTokenProvider(config.googleServiceAccount,new URL(config.endpoint).origin)}`;
  const response=await fetchImpl(config.endpoint,{method:"POST",headers,body:form,signal:AbortSignal.timeout(TIMEOUT_MS),cache:"no-store",redirect:"error"});
  if(!response.ok) throw new DocumentIntelligenceProviderError(`Document intelligence provider returned HTTP ${response.status}.`,response.status===408||response.status===429||response.status>=500);
  if(!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new DocumentIntelligenceProviderError("Document intelligence provider returned an unsupported response type.",false);
  const raw=await response.text(); if(raw.length>RESPONSE_LIMIT) throw new DocumentIntelligenceProviderError("Document intelligence response exceeded the allowed size.",false);
  let result:DocumentIntelligenceResult; try{result=JSON.parse(raw) as DocumentIntelligenceResult;}catch{throw new DocumentIntelligenceProviderError("Document intelligence provider returned invalid JSON.",false);}
  if(result.contractVersion!==DOCUMENT_INTELLIGENCE_CONTRACT_VERSION||result.provider!==config.provider) throw new DocumentIntelligenceProviderError("Document intelligence provider identity or contract mismatch.",false);
  return result;
}
function secureUrl(value:string|undefined){try{const url=new URL(value??"");return url.protocol==="https:"?url.toString():null;}catch{return null;}}
type IdentityTokenProvider=(credentials:ServiceAccountCredentials,audience:string)=>Promise<string>;
async function googleIdentityToken(credentials:ServiceAccountCredentials,audience:string){const client=await new GoogleAuth({credentials}).getIdTokenClient(audience);const headers=await client.getRequestHeaders();const authorization=headers.get("authorization");if(!authorization?.startsWith("Bearer "))throw new DocumentIntelligenceProviderError("Private provider identity token is unavailable.",true);return authorization.slice(7);}
function parseServiceAccount(value:string|undefined):ServiceAccountCredentials|null{if(!value?.trim())return null;try{const parsed=JSON.parse(value) as Partial<ServiceAccountCredentials>;return typeof parsed.client_email==="string"&&parsed.client_email.includes("@")&&typeof parsed.private_key==="string"&&parsed.private_key.includes("BEGIN PRIVATE KEY")?{client_email:parsed.client_email,private_key:parsed.private_key,...(typeof parsed.project_id==="string"?{project_id:parsed.project_id}:{})}:null;}catch{return null;}}
