import { DOCUMENT_INTELLIGENCE_CONTRACT_VERSION, type DocumentIntelligenceRequest, type DocumentIntelligenceResult } from "./document-intelligence";

const TIMEOUT_MS=120_000,RESPONSE_LIMIT=2_000_000;
export type DocumentIntelligenceProviderConfig={endpoint:string;apiKey:string;provider:string};
export class DocumentIntelligenceProviderError extends Error { constructor(message:string,readonly retryable:boolean){super(message);} }

export function parseDocumentIntelligenceProviderConfig(env:Record<string,string|undefined>):DocumentIntelligenceProviderConfig|null{
  const endpoint=secureUrl(env.BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_ENDPOINT),apiKey=env.BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_API_KEY?.trim()??"",provider=env.BUDDY_UNDERWRITER_DOCUMENT_INTELLIGENCE_PROVIDER?.trim()??"";
  return endpoint&&apiKey.length>=16&&provider.length>=2&&provider.length<=120?{endpoint,apiKey,provider}:null;
}

export async function submitDocumentIntelligence(config:DocumentIntelligenceProviderConfig,request:DocumentIntelligenceRequest,blob:Blob,fetchImpl:typeof fetch=fetch):Promise<DocumentIntelligenceResult>{
  const form=new FormData(); form.set("file",blob,`${request.documentVersionId}.document`); form.set("request",JSON.stringify(request));
  const response=await fetchImpl(config.endpoint,{method:"POST",headers:{Authorization:`Bearer ${config.apiKey}`,"Idempotency-Key":`${request.jobId}:${request.documentVersionId}`,Accept:"application/json"},body:form,signal:AbortSignal.timeout(TIMEOUT_MS),cache:"no-store",redirect:"error"});
  if(!response.ok) throw new DocumentIntelligenceProviderError(`Document intelligence provider returned HTTP ${response.status}.`,response.status===408||response.status===429||response.status>=500);
  if(!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new DocumentIntelligenceProviderError("Document intelligence provider returned an unsupported response type.",false);
  const raw=await response.text(); if(raw.length>RESPONSE_LIMIT) throw new DocumentIntelligenceProviderError("Document intelligence response exceeded the allowed size.",false);
  let result:DocumentIntelligenceResult; try{result=JSON.parse(raw) as DocumentIntelligenceResult;}catch{throw new DocumentIntelligenceProviderError("Document intelligence provider returned invalid JSON.",false);}
  if(result.contractVersion!==DOCUMENT_INTELLIGENCE_CONTRACT_VERSION||result.provider!==config.provider) throw new DocumentIntelligenceProviderError("Document intelligence provider identity or contract mismatch.",false);
  return result;
}
function secureUrl(value:string|undefined){try{const url=new URL(value??"");return url.protocol==="https:"?url.toString():null;}catch{return null;}}
