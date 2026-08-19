# Authorization and activation hardening

This change makes the database the authority for customer-visible activation and deal access. It does **not** activate any organization.

## Runtime contract

- Capability use requires an active row in `organization_capability_activations`.
- Missing, disabled, future, or expired activation rows fail closed.
- Institution-wide owners and administrators retain operational oversight.
- Other operators may read and mutate only assigned deals or borrowers.
- Public lifecycle RPCs validate both capability activation and object assignment before entering their legacy `SECURITY DEFINER` bodies.
- Funding and boarding remain reachable only through the hardened golden-loan wrappers.

## Commissioning

Commissioning is a separate, explicit production operation after migration, review, and customer approval. Insert one activation row per approved capability with `activated_by`, `activated_at`, and a durable evidence reference. Never infer activation from deployment or module entitlement.

## Verification

CI resets the database from zero and executes `supabase/tests/authorization_activation_lifecycle.sql`. The test proves inactive denial, cross-organization isolation, assignment-scoped reads and commands, stage prerequisites, and idempotent closing replay.

## Rollback

Disable or expire activation rows first to fail closed. If application rollback is required, keep the hardening migration in place; the compatibility wrappers preserve public RPC signatures. Restore code independently after authorization behavior is confirmed.
