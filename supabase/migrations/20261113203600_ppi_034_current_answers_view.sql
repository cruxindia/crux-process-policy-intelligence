-- PPI-034: interview_current_answers was created with "a.*", which Postgres expands once; add the M3 column (from_suggestion)
-- so reviewers see which answers were taken from a suggested answer (D-084). Same rows, same security_invoker.
create or replace view public.interview_current_answers with (security_invoker = true) as
select distinct on (a.company_id, a.question_id) a.*
  from public.interview_answers a
 order by a.company_id, a.question_id, a.revision_no desc;
