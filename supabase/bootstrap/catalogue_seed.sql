-- Blueprint §5 baseline catalogue (16 functions, 93 core processes, 23 enterprise policies, 32 department SOPs) for CRUX and the
-- synthetic tenant. Idempotent; every item starts "Unassessed" — classification is a human decision (PPI-030).
select c.code, private.seed_blueprint_catalogue(c.id) as added from public.companies c where c.code in ('CRUX', 'E2E-SYNTH');
