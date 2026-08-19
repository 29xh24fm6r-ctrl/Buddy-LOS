type CrmCommandFailure = {
  command:string;
  organizationId:string;
  userId:string;
  code?:string;
  message?:string;
};

export function logCrmCommandFailure(failure:CrmCommandFailure){
  console.error(JSON.stringify({
    event:"crm.command_failed",
    command:failure.command,
    organizationId:failure.organizationId,
    userId:failure.userId,
    code:failure.code??"unknown",
    message:failure.message??"CRM command failed",
    occurredAt:new Date().toISOString(),
  }));
}
