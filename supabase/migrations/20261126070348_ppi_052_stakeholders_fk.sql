-- PPI-052: doc_stakeholders made PostgREST see a second memberships<->companies path (junction table), so the older web build
-- (still served on Netlify) failed with "more than one relationship was found for 'memberships' and 'companies'".
-- The direct company FK is redundant: (company_id, membership_id) already references memberships(company_id, id), and every
-- membership references its company. Dropping it removes the junction without weakening integrity.
alter table public.doc_stakeholders drop constraint doc_stakeholders_company_id_fkey;
