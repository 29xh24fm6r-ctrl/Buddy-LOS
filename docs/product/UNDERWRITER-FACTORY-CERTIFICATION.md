# Underwriter factory certification

Buddy SBA remains a separately entitled downstream module. This slice ports only conservative 7(a) eligibility and artifact/third-party requirements; it does not activate an SBA subscription, submit forms, call E-Tran, or replace lender/SBA review.

The Underwriter release gate requires golden-loan parity, security and tenant-isolation evidence, rollback rehearsal, alert configuration, bounded measured cost, a bounded pilot cohort, and the production flag remaining off. Passing produces only `release_candidate`; production activation still requires explicit human authorization and observed pilot evidence.

Rollback is operationally simple while default-off: disable the Underwriter runtime flag and/or suspend the organization module entitlement. Durable artifacts remain for audit. Database migrations are additive and are not applied to production by this PR.
