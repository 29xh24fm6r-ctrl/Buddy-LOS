grant execute on function public.record_document_scan_result(
  uuid, uuid, text, text, public.document_security_status, text, text, text, jsonb
) to service_role;

comment on function public.record_document_scan_result(
  uuid, uuid, text, text, public.document_security_status, text, text, text, jsonb
) is 'Trusted scanner terminal transition. Executable only by service_role after the application verifies scanner authentication and exact private-object readback.';
