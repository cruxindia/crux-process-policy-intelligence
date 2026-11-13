# Database Schema Reference

**Generated** 2026-11-13T10:40Z from a clean install of `supabase/migrations` (PPI-001…031) by `scripts/gen-schema-ref.sql`. Do not hand-edit; regenerate.

Summary: **68 tables**, **3 views**, **142 RLS policies** in `public`, **78 private helper functions**. All tables RLS-enabled. Same migrations applied to Supabase dev `pahzxpileudulljgaciw` (PG 17).

### `agent_roles`
RLS: enabled · Policies: `agent_roles_read` (SELECT)

Triggers: agent_roles_guard, agent_roles_hash

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `team_id` | uuid | not null |
| `code` | text | not null |
| `version` | integer | not null |
| `title` | text | not null |
| `credentials` | text | not null |
| `charter` | text | not null |
| `charter_sha256` | text | not null |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, team_id) REFERENCES agent_teams(company_id, id)

### `agent_teams`
RLS: enabled · Policies: `agent_teams_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `mission` | text | not null |
| `sort_order` | smallint | not null |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `ai_connection_assignments`
RLS: enabled · Policies: `aca_admin_ins` (INSERT), `aca_admin_read` (SELECT), `aca_admin_upd` (UPDATE)

Triggers: audit_ai_connection_assignments

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `connection_id` | uuid | not null |
| `department_id` | uuid |  |
| `process_id` | uuid |  |
| `interview_category` | text |  |
| `active` | boolean | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, connection_id) REFERENCES ai_provider_connections(company_id, id)
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)

### `ai_jobs`
RLS: enabled · Policies: `aj_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `membership_id` | uuid |  |
| `session_id` | uuid |  |
| `process_id` | uuid |  |
| `connection_id` | uuid |  |
| `task_type` | text | not null |
| `payload_ref` | jsonb | not null |
| `priority` | smallint | not null |
| `status` | text | not null |
| `retry_count` | integer | not null |
| `run_after` | timestamp with time zone | not null |
| `idempotency_key` | text | not null |
| `error_class` | text |  |
| `created_at` | timestamp with time zone | not null |
| `started_at` | timestamp with time zone |  |
| `completed_at` | timestamp with time zone |  |

Foreign keys:
- FOREIGN KEY (company_id, connection_id) REFERENCES ai_provider_connections(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES discovered_processes(company_id, id)
- FOREIGN KEY (company_id, session_id) REFERENCES interview_sessions(company_id, id)

### `ai_provider_connections`
RLS: enabled · Policies: `apc_admin_ins` (INSERT), `apc_admin_read` (SELECT), `apc_admin_upd` (UPDATE)

Triggers: apc_limit, apc_updated, audit_ai_provider_connections

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `name` | text | not null |
| `provider` | text | not null |
| `policy_provider` | text | not null |
| `gcp_project_id` | text |  |
| `model` | text | not null |
| `base_url` | text |  |
| `priority` | smallint | not null |
| `status` | text | not null |
| `vault_secret_id` | uuid |  |
| `key_set_at` | timestamp with time zone |  |
| `health` | text | not null |
| `last_tested_at` | timestamp with time zone |  |
| `last_success_at` | timestamp with time zone |  |
| `last_error_class` | text |  |
| `last_error_at` | timestamp with time zone |  |
| `cooldown_until` | timestamp with time zone |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, policy_provider) REFERENCES ai_provider_policies(company_id, provider)

### `ai_provider_policies`
RLS: enabled · Policies: `app_read` (SELECT)

Triggers: audit_ai_provider_policies

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `provider` | text | not null |
| `max_classification` | text | not null |
| `may_train_on_inputs` | boolean | not null |
| `terms_checked_on` | date | not null |
| `status` | text | not null |
| `notes` | text |  |
| `created_at` | timestamp with time zone | not null |
| `training_accepted_by_membership_id` | uuid |  |
| `training_accepted_on` | date |  |
| `training_acceptance_note` | text |  |

Foreign keys:
- FOREIGN KEY (company_id, training_accepted_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `ai_runs`
RLS: enabled · Policies: `air_insert` (INSERT), `air_read` (SELECT)

Triggers: ai_runs_guard, ai_runs_no_delete

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `capability` | text | not null |
| `provider` | text | not null |
| `model` | text | not null |
| `prompt_version_id` | uuid | not null |
| `data_classification` | text | not null |
| `requested_by_membership_id` | uuid |  |
| `context_source_ids` | uuid[] | not null |
| `input_sha256` | text |  |
| `output_sha256` | text |  |
| `status` | text | not null |
| `schema_valid` | boolean |  |
| `unsupported_claim_count` | integer |  |
| `invalid_source_ref_count` | integer |  |
| `error_text` | text |  |
| `idempotency_key` | text |  |
| `created_at` | timestamp with time zone | not null |
| `finished_at` | timestamp with time zone |  |
| `connection_id` | uuid |  |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, prompt_version_id) REFERENCES prompt_versions(company_id, id)
- FOREIGN KEY (company_id, requested_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, connection_id) REFERENCES ai_provider_connections(company_id, id)

### `approval_decisions`
RLS: enabled · Policies: `ad_insert` (INSERT), `ad_read` (SELECT)

Triggers: approval_decisions_after, approval_decisions_append_only, approval_decisions_guard, audit_approval_decisions

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `version_id` | uuid | not null |
| `step_no` | integer | not null |
| `decided_by_membership_id` | uuid | not null |
| `decision` | text | not null |
| `comment` | text |  |
| `content_sha256` | text |  |
| `decided_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, decided_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, version_id) REFERENCES document_versions(company_id, id)

### `approval_route_steps`
RLS: enabled · Policies: `ars_read` (SELECT), `ars_write` (INSERT)

Triggers: approval_route_steps_guard

| Column | Type | Null |
|---|---|---|
| `company_id` | uuid | not null |
| `route_id` | uuid | not null |
| `step_no` | integer | not null |
| `step_kind` | text | not null |
| `required_permission` | text | not null |
| `required_approvals` | integer | not null |

Foreign keys:
- FOREIGN KEY (company_id, route_id) REFERENCES approval_routes(company_id, id)
- FOREIGN KEY (required_permission) REFERENCES permissions(code)

### `approval_routes`
RLS: enabled · Policies: `ar_read` (SELECT), `ar_update` (UPDATE), `ar_write` (INSERT)

Triggers: audit_approval_routes

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `version` | integer | not null |
| `name` | text | not null |
| `document_type_id` | uuid |  |
| `status` | text | not null |
| `segregate_author` | boolean | not null |
| `distinct_approvers` | boolean | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, document_type_id) REFERENCES document_types(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `audit_events`
RLS: enabled · Policies: `audit_events_read` (SELECT)

Triggers: audit_events_append_only

| Column | Type | Null |
|---|---|---|
| `id` | bigint | not null |
| `company_id` | uuid | not null |
| `occurred_at` | timestamp with time zone | not null |
| `actor_user_id` | uuid |  |
| `actor_type` | text | not null |
| `action` | text | not null |
| `object_type` | text | not null |
| `object_id` | text | not null |
| `changed_fields` | text[] |  |
| `before_data` | jsonb |  |
| `after_data` | jsonb |  |
| `correlation_id` | text |  |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `background_jobs`
RLS: enabled · Policies: none (deny all)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | bigint | not null |
| `company_id` | uuid | not null |
| `job_type` | text | not null |
| `payload` | jsonb | not null |
| `idempotency_key` | text | not null |
| `status` | text | not null |
| `attempts` | integer | not null |
| `max_attempts` | integer | not null |
| `run_after` | timestamp with time zone | not null |
| `locked_at` | timestamp with time zone |  |
| `locked_by` | text |  |
| `last_error` | text |  |
| `created_at` | timestamp with time zone | not null |
| `finished_at` | timestamp with time zone |  |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `board_cases`
RLS: enabled · Policies: `board_cases_read` (SELECT)

Triggers: audit_board_cases, board_cases_no_delete, board_cases_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `kind` | text | not null |
| `doc_type` | text |  |
| `title` | text | not null |
| `brief` | text | not null |
| `source_process_ids` | uuid[] | not null |
| `classification` | text | not null |
| `status` | text | not null |
| `plan` | jsonb |  |
| `next_step` | integer | not null |
| `revision_rounds` | smallint | not null |
| `last_error` | text |  |
| `run_lock_until` | timestamp with time zone |  |
| `created_by_membership_id` | uuid | not null |
| `decided_by_membership_id` | uuid |  |
| `decided_at` | timestamp with time zone |  |
| `decision_note` | text |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, created_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, decided_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `board_outputs`
RLS: enabled · Policies: `board_outputs_read` (SELECT)

Triggers: board_outputs_append_only

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `case_id` | uuid | not null |
| `version` | integer | not null |
| `title` | text | not null |
| `body_md` | text | not null |
| `dissent` | text |  |
| `audit_verdict` | text |  |
| `audit_notes` | text |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, case_id) REFERENCES board_cases(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `board_turns`
RLS: enabled · Policies: `board_turns_read` (SELECT)

Triggers: board_turns_append_only

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `case_id` | uuid | not null |
| `seq` | integer | not null |
| `step` | integer | not null |
| `role_id` | uuid | not null |
| `role_code` | text | not null |
| `team_code` | text | not null |
| `kind` | text | not null |
| `addressed_to` | text[] | not null |
| `summary` | text | not null |
| `content` | text | not null |
| `key_points` | text[] | not null |
| `citations` | text[] | not null |
| `verdict` | text |  |
| `ai_run_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, case_id) REFERENCES board_cases(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, role_id) REFERENCES agent_roles(company_id, id)

### `catalogue_classification_requests`
RLS: enabled · Policies: `catalogue_requests_read` (SELECT)

Triggers: audit_catalogue_requests, catalogue_requests_no_delete

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `item_id` | uuid | not null |
| `from_class` | text | not null |
| `to_class` | text | not null |
| `basis` | text |  |
| `basis_reference` | text |  |
| `reason` | text | not null |
| `requested_by` | uuid | not null |
| `requested_at` | timestamp with time zone | not null |
| `status` | text | not null |
| `decided_by` | uuid |  |
| `decided_at` | timestamp with time zone |  |
| `decision_note` | text |  |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, item_id) REFERENCES catalogue_items(company_id, id)

### `catalogue_functions`
RLS: enabled · Policies: `catalogue_functions_read` (SELECT)

Triggers: audit_catalogue_functions, catalogue_functions_no_delete, catalogue_functions_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `description` | text |  |
| `sort_order` | smallint | not null |
| `department_id` | uuid |  |
| `status` | text | not null |
| `source` | text | not null |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `catalogue_item_sources`
RLS: enabled · Policies: `catalogue_sources_read` (SELECT)

Triggers: audit_catalogue_sources

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `item_id` | uuid | not null |
| `discovered_process_id` | uuid | not null |
| `method` | text | not null |
| `linked_by` | uuid | not null |
| `linked_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, discovered_process_id) REFERENCES discovered_processes(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, item_id) REFERENCES catalogue_items(company_id, id)

### `catalogue_items`
RLS: enabled · Policies: `catalogue_items_read` (SELECT)

Triggers: audit_catalogue_items, catalogue_items_no_delete, catalogue_items_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `kind` | text | not null |
| `code` | text | not null |
| `title` | text | not null |
| `description` | text |  |
| `function_id` | uuid | not null |
| `ownership_note` | text |  |
| `source` | text | not null |
| `status` | text | not null |
| `classification` | text | not null |
| `basis` | text |  |
| `basis_reference` | text |  |
| `classification_reason` | text |  |
| `classified_by` | uuid |  |
| `classified_at` | timestamp with time zone |  |
| `approved_by` | uuid |  |
| `process_status` | text | not null |
| `process_note` | text |  |
| `document_status` | text | not null |
| `document_note` | text |  |
| `process_id` | uuid |  |
| `discovered_process_id` | uuid |  |
| `board_case_id` | uuid |  |
| `document_id` | uuid |  |
| `status_updated_by` | uuid |  |
| `status_updated_at` | timestamp with time zone |  |
| `created_by` | uuid |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, board_case_id) REFERENCES board_cases(company_id, id)
- FOREIGN KEY (company_id, discovered_process_id) REFERENCES discovered_processes(company_id, id)
- FOREIGN KEY (company_id, document_id) REFERENCES documents(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, function_id) REFERENCES catalogue_functions(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)

### `clarification_responses`
RLS: enabled · Policies: `cr_insert` (INSERT), `cr_read` (SELECT)

Triggers: audit_clarification_responses, clarification_responses_after, clarification_responses_append_only, clarification_responses_before, clarification_responses_notify

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `task_id` | uuid | not null |
| `responder_membership_id` | uuid | not null |
| `response_text` | text | not null |
| `evidence_file_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, evidence_file_id) REFERENCES evidence_files(company_id, id)
- FOREIGN KEY (company_id, responder_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, task_id) REFERENCES clarification_tasks(company_id, id)

### `clarification_tasks`
RLS: enabled · Policies: `ct_insert` (INSERT), `ct_read` (SELECT), `ct_update` (UPDATE)

Triggers: audit_clarification_tasks, clarification_tasks_guard, clarification_tasks_notify, clarification_tasks_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `requester_membership_id` | uuid | not null |
| `requesting_department_id` | uuid | not null |
| `assignee_department_id` | uuid | not null |
| `assignee_membership_id` | uuid |  |
| `process_id` | uuid |  |
| `knowledge_record_id` | uuid |  |
| `question_text` | text | not null |
| `context_text` | text |  |
| `priority` | text | not null |
| `due_at` | timestamp with time zone |  |
| `status` | text | not null |
| `outcome_text` | text |  |
| `escalation_level` | integer | not null |
| `idempotency_key` | text |  |
| `resolved_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, assignee_department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id, assignee_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, knowledge_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)
- FOREIGN KEY (company_id, requester_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, requesting_department_id) REFERENCES departments(company_id, id)

### `companies`
RLS: enabled · Policies: `companies_invited_read` (SELECT), `companies_read` (SELECT), `companies_update` (UPDATE)

Triggers: companies_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `timezone` | text | not null |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |
| `ai_connection_limit` | smallint | not null |
| `catalogue_settings` | jsonb | not null |



### `company_join_links`
RLS: enabled · Policies: `cjl_read` (SELECT), `cjl_update` (UPDATE)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `label` | text | not null |
| `token_sha256` | text | not null |
| `campaign_id` | uuid | not null |
| `department_id` | uuid | not null |
| `status` | text | not null |
| `max_per_day` | integer | not null |
| `created_by_membership_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, campaign_id) REFERENCES interview_campaigns(company_id, id)
- FOREIGN KEY (company_id, created_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `departments`
RLS: enabled · Policies: `departments_read` (SELECT), `departments_update` (UPDATE), `departments_write` (INSERT)

Triggers: audit_departments, departments_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `parent_department_id` | uuid |  |
| `mandate` | text |  |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, parent_department_id) REFERENCES departments(company_id, id)

### `discovered_process_flows`
RLS: enabled · Policies: `dpf_read` (SELECT)

Triggers: dpf_append_only

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `process_id` | uuid | not null |
| `version` | integer | not null |
| `flow` | jsonb | not null |
| `ai_run_id` | uuid | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, process_id) REFERENCES discovered_processes(company_id, id)

### `discovered_processes`
RLS: enabled · Policies: `dpr_read` (SELECT)

Triggers: audit_discovered_processes, dpr_no_delete

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `session_id` | uuid | not null |
| `membership_id` | uuid | not null |
| `process_key` | text | not null |
| `name` | text | not null |
| `purpose` | text |  |
| `involvement` | text |  |
| `owner_text` | text |  |
| `importance` | text |  |
| `frequency` | text |  |
| `volume` | text |  |
| `departments` | text[] | not null |
| `status` | text | not null |
| `completeness` | smallint | not null |
| `coverage` | jsonb | not null |
| `flow` | jsonb | not null |
| `flow_version` | integer | not null |
| `linked_process_id` | uuid |  |
| `first_ai_run_id` | uuid |  |
| `last_ai_run_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, first_ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, last_ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, linked_process_id) REFERENCES processes(company_id, id)
- FOREIGN KEY (company_id, membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, session_id) REFERENCES interview_sessions(company_id, id)

### `discovery_profiles`
RLS: enabled · Policies: `dp_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `company_id` | uuid | not null |
| `session_id` | uuid | not null |
| `membership_id` | uuid | not null |
| `profile` | jsonb | not null |
| `responsibilities` | jsonb | not null |
| `inventory_confirmed` | boolean | not null |
| `stage` | text | not null |
| `focus_process_key` | text |  |
| `last_ai_run_id` | uuid |  |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, last_ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, session_id) REFERENCES interview_sessions(company_id, id)

### `dispute_decisions`
RLS: enabled · Policies: `dd_insert` (INSERT), `dd_read` (SELECT)

Triggers: audit_dispute_decisions, dispute_decisions_after, dispute_decisions_append_only, dispute_decisions_guard, dispute_decisions_notify

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `dispute_id` | uuid | not null |
| `decided_by_membership_id` | uuid | not null |
| `decision_text` | text | not null |
| `rationale` | text | not null |
| `resulting_actions` | text |  |
| `decided_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, decided_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, dispute_id) REFERENCES disputes(company_id, id)

### `dispute_positions`
RLS: enabled · Policies: `dp_insert` (INSERT), `dp_read` (SELECT)

Triggers: audit_dispute_positions, dispute_positions_append_only, dispute_positions_guard, dispute_positions_notify

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `dispute_id` | uuid | not null |
| `participant_membership_id` | uuid | not null |
| `position_text` | text | not null |
| `context_text` | text |  |
| `knowledge_record_id` | uuid |  |
| `evidence_file_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, dispute_id) REFERENCES disputes(company_id, id)
- FOREIGN KEY (company_id, evidence_file_id) REFERENCES evidence_files(company_id, id)
- FOREIGN KEY (company_id, knowledge_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, participant_membership_id) REFERENCES memberships(company_id, id)

### `disputes`
RLS: enabled · Policies: `ds_insert` (INSERT), `ds_read` (SELECT), `ds_update` (UPDATE)

Triggers: audit_disputes, disputes_guard, disputes_notify, disputes_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `issue_statement` | text | not null |
| `department_id` | uuid | not null |
| `process_id` | uuid |  |
| `knowledge_record_id` | uuid |  |
| `clarification_task_id` | uuid |  |
| `impact_text` | text |  |
| `context_differences` | text |  |
| `raised_by_membership_id` | uuid | not null |
| `decision_owner_membership_id` | uuid | not null |
| `status` | text | not null |
| `idempotency_key` | text |  |
| `decided_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, clarification_task_id) REFERENCES clarification_tasks(company_id, id)
- FOREIGN KEY (company_id, decision_owner_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, knowledge_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)
- FOREIGN KEY (company_id, raised_by_membership_id) REFERENCES memberships(company_id, id)

### `document_acknowledgements`
RLS: enabled · Policies: `ack_insert` (INSERT), `ack_read` (SELECT)

Triggers: audit_document_acknowledgements, document_acknowledgements_append_only, document_acknowledgements_guard

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `version_id` | uuid | not null |
| `membership_id` | uuid | not null |
| `acknowledged_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, version_id) REFERENCES document_versions(company_id, id)

### `document_change_requests`
RLS: enabled · Policies: `dcr_insert` (INSERT), `dcr_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `document_id` | uuid | not null |
| `requested_by_membership_id` | uuid | not null |
| `reason` | text | not null |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, document_id) REFERENCES documents(company_id, id)
- FOREIGN KEY (company_id, requested_by_membership_id) REFERENCES memberships(company_id, id)

### `document_distributions`
RLS: enabled · Policies: `dist_insert` (INSERT), `dist_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `version_id` | uuid | not null |
| `membership_id` | uuid | not null |
| `channel` | text | not null |
| `delivered_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, version_id) REFERENCES document_versions(company_id, id)

### `document_types`
RLS: enabled · Policies: `dt_read` (SELECT), `dt_write` (INSERT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `default_review_months` | integer |  |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `document_version_sources`
RLS: enabled · Policies: `dvs_insert` (INSERT), `dvs_read` (SELECT)

Triggers: document_version_sources_guard

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `version_id` | uuid | not null |
| `knowledge_record_id` | uuid |  |
| `process_version_id` | uuid |  |
| `evidence_file_id` | uuid |  |
| `note` | text |  |

Foreign keys:
- FOREIGN KEY (company_id, evidence_file_id) REFERENCES evidence_files(company_id, id)
- FOREIGN KEY (company_id, knowledge_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, process_version_id) REFERENCES process_versions(company_id, id)
- FOREIGN KEY (company_id, version_id) REFERENCES document_versions(company_id, id)

### `document_versions`
RLS: enabled · Policies: `dv_insert` (INSERT), `dv_read` (SELECT), `dv_update` (UPDATE)

Triggers: audit_document_versions, document_versions_guard, document_versions_no_delete, document_versions_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `document_id` | uuid | not null |
| `version_no` | integer | not null |
| `status` | text | not null |
| `body_markdown` | text | not null |
| `change_summary` | text |  |
| `route_id` | uuid |  |
| `content_sha256` | text |  |
| `author_membership_id` | uuid |  |
| `supersedes_version_id` | uuid |  |
| `effective_date` | date |  |
| `review_due_date` | date |  |
| `submitted_at` | timestamp with time zone |  |
| `approved_at` | timestamp with time zone |  |
| `published_at` | timestamp with time zone |  |
| `published_by_membership_id` | uuid |  |
| `is_emergency` | boolean | not null |
| `emergency_reason` | text |  |
| `retrospective_review_due` | date |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, author_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, document_id) REFERENCES documents(company_id, id)
- FOREIGN KEY (company_id, published_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, route_id) REFERENCES approval_routes(company_id, id)
- FOREIGN KEY (company_id, supersedes_version_id) REFERENCES document_versions(company_id, id)

### `documents`
RLS: enabled · Policies: `doc_insert` (INSERT), `doc_read` (SELECT), `doc_update` (UPDATE)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `doc_code` | text | not null |
| `title` | text | not null |
| `document_type_id` | uuid | not null |
| `owner_membership_id` | uuid | not null |
| `department_id` | uuid | not null |
| `process_id` | uuid |  |
| `classification` | text | not null |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id, document_type_id) REFERENCES document_types(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, owner_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)

### `evidence_files`
RLS: enabled · Policies: `ev_insert` (INSERT), `ev_read` (SELECT), `ev_update` (UPDATE)

Triggers: audit_evidence_files, evidence_files_guard, evidence_files_no_delete

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `department_id` | uuid | not null |
| `process_id` | uuid |  |
| `title` | text | not null |
| `storage_bucket` | text | not null |
| `storage_path` | text | not null |
| `sha256` | text | not null |
| `mime_type` | text | not null |
| `size_bytes` | bigint | not null |
| `classification` | text | not null |
| `source_date` | date |  |
| `source_version` | text |  |
| `uploaded_by_membership_id` | uuid | not null |
| `review_status` | text | not null |
| `review_note` | text |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)
- FOREIGN KEY (company_id, uploaded_by_membership_id) REFERENCES memberships(company_id, id)

### `interview_answer_analyses`
RLS: enabled · Policies: `iaa_read` (SELECT)

Triggers: iaa_append_only

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `session_id` | uuid | not null |
| `answer_id` | uuid | not null |
| `ai_run_id` | uuid | not null |
| `understood_answer` | text | not null |
| `analysis` | jsonb | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, answer_id) REFERENCES interview_answers(company_id, id)
- FOREIGN KEY (company_id, session_id) REFERENCES interview_sessions(company_id, id)

### `interview_answer_drafts`
RLS: enabled · Policies: `iad_owner` (ALL)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `company_id` | uuid | not null |
| `question_id` | uuid | not null |
| `draft_text` | text |  |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, question_id) REFERENCES interview_questions(company_id, id) ON DELETE CASCADE

### `interview_answers`
RLS: enabled · Policies: `ians_insert` (INSERT), `ians_read` (SELECT)

Triggers: audit_interview_answers, interview_answers_append_only, interview_answers_guard

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `question_id` | uuid | not null |
| `revision_no` | integer | not null |
| `supersedes_answer_id` | uuid |  |
| `answer_kind` | text | not null |
| `answer_text` | text |  |
| `knowledge_basis` | text | not null |
| `referred_membership_id` | uuid |  |
| `referred_note` | text |  |
| `answered_by_membership_id` | uuid | not null |
| `revision_reason` | text |  |
| `answered_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, answered_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, question_id) REFERENCES interview_questions(company_id, id)
- FOREIGN KEY (company_id, referred_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, supersedes_answer_id) REFERENCES interview_answers(company_id, id)

### `interview_assignments`
RLS: enabled · Policies: `ia_read` (SELECT), `ia_update` (UPDATE), `ia_write` (INSERT)

Triggers: interview_assignments_guard, interview_assignments_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `campaign_id` | uuid | not null |
| `respondent_membership_id` | uuid | not null |
| `department_id` | uuid | not null |
| `process_id` | uuid |  |
| `status` | text | not null |
| `due_on` | date |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, campaign_id) REFERENCES interview_campaigns(company_id, id)
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)
- FOREIGN KEY (company_id, respondent_membership_id) REFERENCES memberships(company_id, id)

### `interview_campaigns`
RLS: enabled · Policies: `ic_read` (SELECT), `ic_update` (UPDATE), `ic_write` (INSERT)

Triggers: interview_campaigns_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `purpose` | text |  |
| `department_id` | uuid |  |
| `process_id` | uuid |  |
| `owner_membership_id` | uuid | not null |
| `status` | text | not null |
| `starts_on` | date |  |
| `due_on` | date |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |
| `question_scopes` | text[] |  |
| `interview_mode` | text | not null |
| `ai_provider` | text |  |
| `max_ai_questions` | integer | not null |

Foreign keys:
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, owner_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)

### `interview_clarifications`
RLS: enabled · Policies: `icl_read` (SELECT)

Triggers: audit_interview_clarifications, icl_guard, icl_no_delete

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `session_id` | uuid | not null |
| `earlier_answer_id` | uuid | not null |
| `later_answer_id` | uuid | not null |
| `description` | text | not null |
| `question_id` | uuid |  |
| `status` | text | not null |
| `raised_by_ai_run_id` | uuid | not null |
| `resolved_by_ai_run_id` | uuid |  |
| `resolution_note` | text |  |
| `created_at` | timestamp with time zone | not null |
| `resolved_at` | timestamp with time zone |  |

Foreign keys:
- FOREIGN KEY (company_id, earlier_answer_id) REFERENCES interview_answers(company_id, id)
- FOREIGN KEY (company_id, later_answer_id) REFERENCES interview_answers(company_id, id)
- FOREIGN KEY (company_id, question_id) REFERENCES interview_questions(company_id, id)
- FOREIGN KEY (company_id, raised_by_ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, resolved_by_ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, session_id) REFERENCES interview_sessions(company_id, id)

### `interview_dimension_coverage`
RLS: enabled · Policies: `idc_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `company_id` | uuid | not null |
| `session_id` | uuid | not null |
| `dimension` | text | not null |
| `status` | text | not null |
| `note` | text |  |
| `ai_run_id` | uuid |  |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, session_id) REFERENCES interview_sessions(company_id, id)

### `interview_questions`
RLS: enabled · Policies: `iq_insert` (INSERT), `iq_read` (SELECT)

Triggers: interview_questions_append_only

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `session_id` | uuid | not null |
| `seq` | integer | not null |
| `template_id` | uuid |  |
| `parent_question_id` | uuid |  |
| `field_key` | text | not null |
| `question_text` | text | not null |
| `rationale` | text |  |
| `generated_by` | text | not null |
| `prompt_version_id` | uuid |  |
| `ai_run_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, parent_question_id) REFERENCES interview_questions(company_id, id)
- FOREIGN KEY (company_id, prompt_version_id) REFERENCES prompt_versions(company_id, id)
- FOREIGN KEY (company_id, session_id) REFERENCES interview_sessions(company_id, id)
- FOREIGN KEY (company_id, template_id) REFERENCES question_templates(company_id, id)

### `interview_sessions`
RLS: enabled · Policies: `is_insert` (INSERT), `is_read` (SELECT), `is_update` (UPDATE)

Triggers: audit_interview_sessions, interview_sessions_guard, interview_sessions_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `assignment_id` | uuid | not null |
| `status` | text | not null |
| `started_at` | timestamp with time zone | not null |
| `submitted_at` | timestamp with time zone |  |
| `respondent_confirmed_at` | timestamp with time zone |  |
| `reviewed_by_membership_id` | uuid |  |
| `reviewed_at` | timestamp with time zone |  |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, assignment_id) REFERENCES interview_assignments(company_id, id)
- FOREIGN KEY (company_id, reviewed_by_membership_id) REFERENCES memberships(company_id, id)

### `knowledge_records`
RLS: enabled · Policies: `kr_insert` (INSERT), `kr_read` (SELECT), `kr_update` (UPDATE)

Triggers: audit_knowledge_records, knowledge_records_guard, knowledge_records_no_delete, knowledge_records_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `record_code` | text | not null |
| `record_type` | text | not null |
| `title` | text | not null |
| `claim_text` | text | not null |
| `department_id` | uuid | not null |
| `process_id` | uuid |  |
| `classification` | text | not null |
| `claim_origin` | text | not null |
| `state_kind` | text | not null |
| `lifecycle_status` | text | not null |
| `confidence` | numeric(3,2) |  |
| `confidence_rationale` | text |  |
| `supersedes_record_id` | uuid |  |
| `ai_run_id` | uuid |  |
| `created_by_membership_id` | uuid |  |
| `verified_by_membership_id` | uuid |  |
| `verified_at` | timestamp with time zone |  |
| `approved_by_membership_id` | uuid |  |
| `approved_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, ai_run_id) REFERENCES ai_runs(company_id, id)
- FOREIGN KEY (company_id, approved_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, created_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)
- FOREIGN KEY (company_id, supersedes_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, verified_by_membership_id) REFERENCES memberships(company_id, id)

### `knowledge_relationships`
RLS: enabled · Policies: `krel_insert` (INSERT), `krel_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `company_id` | uuid | not null |
| `from_record_id` | uuid | not null |
| `to_record_id` | uuid | not null |
| `relation` | text | not null |
| `noted_by_membership_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, from_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, to_record_id) REFERENCES knowledge_records(company_id, id)

### `knowledge_reviews`
RLS: enabled · Policies: `krev_insert` (INSERT), `krev_read` (SELECT)

Triggers: knowledge_reviews_append_only

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `knowledge_record_id` | uuid | not null |
| `reviewer_membership_id` | uuid | not null |
| `action` | text | not null |
| `comment` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, knowledge_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, reviewer_membership_id) REFERENCES memberships(company_id, id)

### `knowledge_sources`
RLS: enabled · Policies: `ks_delete` (DELETE), `ks_insert` (INSERT), `ks_read` (SELECT)

Triggers: audit_knowledge_sources, knowledge_sources_guard

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `knowledge_record_id` | uuid | not null |
| `source_type` | text | not null |
| `interview_answer_id` | uuid |  |
| `evidence_file_id` | uuid |  |
| `source_record_id` | uuid |  |
| `external_reference` | text |  |
| `locator` | text |  |
| `relation` | text | not null |
| `linked_by_membership_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, evidence_file_id) REFERENCES evidence_files(company_id, id)
- FOREIGN KEY (company_id, interview_answer_id) REFERENCES interview_answers(company_id, id)
- FOREIGN KEY (company_id, knowledge_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, source_record_id) REFERENCES knowledge_records(company_id, id)

### `legal_entities`
RLS: enabled · Policies: `legal_entities_read` (SELECT), `legal_entities_update` (UPDATE), `legal_entities_write` (INSERT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `entity_type` | text |  |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `locations`
RLS: enabled · Policies: `locations_read` (SELECT), `locations_update` (UPDATE), `locations_write` (INSERT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `location_type` | text | not null |
| `parent_location_id` | uuid |  |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, parent_location_id) REFERENCES locations(company_id, id)

### `memberships`
RLS: enabled · Policies: `memberships_read` (SELECT), `memberships_self_read` (SELECT), `memberships_update` (UPDATE), `memberships_write` (INSERT)

Triggers: audit_memberships, memberships_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `user_id` | uuid | not null |
| `member_kind` | text | not null |
| `job_title` | text |  |
| `primary_department_id` | uuid |  |
| `primary_location_id` | uuid |  |
| `is_external` | boolean | not null |
| `status` | text | not null |
| `valid_from` | timestamp with time zone | not null |
| `valid_to` | timestamp with time zone |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, primary_department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id, primary_location_id) REFERENCES locations(company_id, id)
- FOREIGN KEY (user_id) REFERENCES auth.users(id)

### `notifications`
RLS: enabled · Policies: `nt_read` (SELECT), `nt_update` (UPDATE)

Triggers: notifications_guard

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `recipient_membership_id` | uuid | not null |
| `kind` | text | not null |
| `title` | text | not null |
| `object_type` | text |  |
| `object_id` | uuid |  |
| `dedupe_key` | text | not null |
| `created_at` | timestamp with time zone | not null |
| `read_at` | timestamp with time zone |  |

Foreign keys:
- FOREIGN KEY (company_id, recipient_membership_id) REFERENCES memberships(company_id, id)

### `permissions`
RLS: enabled · Policies: `permissions_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `code` | text | not null |
| `description` | text | not null |



### `process_departments`
RLS: enabled · Policies: `process_departments_read` (SELECT), `process_departments_write` (INSERT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `company_id` | uuid | not null |
| `process_id` | uuid | not null |
| `department_id` | uuid | not null |
| `relation` | text | not null |

Foreign keys:
- FOREIGN KEY (company_id, department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)

### `process_edges`
RLS: enabled · Policies: `pe_delete` (DELETE), `pe_insert` (INSERT), `pe_read` (SELECT), `pe_update` (UPDATE)

Triggers: process_edges_guard

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `process_version_id` | uuid | not null |
| `from_step_id` | uuid | not null |
| `to_step_id` | uuid | not null |
| `edge_type` | text | not null |
| `condition_label` | text |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, process_version_id, from_step_id) REFERENCES process_steps(company_id, process_version_id, id) ON DELETE CASCADE
- FOREIGN KEY (company_id, process_version_id, to_step_id) REFERENCES process_steps(company_id, process_version_id, id) ON DELETE CASCADE

### `process_step_sources`
RLS: enabled · Policies: `pss_delete` (DELETE), `pss_insert` (INSERT), `pss_read` (SELECT), `pss_update` (UPDATE)

Triggers: process_step_sources_guard

| Column | Type | Null |
|---|---|---|
| `company_id` | uuid | not null |
| `process_step_id` | uuid | not null |
| `knowledge_record_id` | uuid | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, knowledge_record_id) REFERENCES knowledge_records(company_id, id)
- FOREIGN KEY (company_id, process_step_id) REFERENCES process_steps(company_id, id) ON DELETE CASCADE

### `process_steps`
RLS: enabled · Policies: `ps_delete` (DELETE), `ps_insert` (INSERT), `ps_read` (SELECT), `ps_update` (UPDATE)

Triggers: process_steps_guard

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `process_version_id` | uuid | not null |
| `step_code` | text | not null |
| `seq` | integer | not null |
| `step_type` | text | not null |
| `name` | text | not null |
| `description` | text |  |
| `actor_role_text` | text |  |
| `performer_department_id` | uuid |  |
| `system_name` | text |  |
| `sla_text` | text |  |
| `subprocess_id` | uuid |  |
| `is_assumption` | boolean | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, performer_department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id, process_version_id) REFERENCES process_versions(company_id, id) ON DELETE CASCADE
- FOREIGN KEY (company_id, subprocess_id) REFERENCES processes(company_id, id)

### `process_versions`
RLS: enabled · Policies: `pv_insert` (INSERT), `pv_read` (SELECT), `pv_update` (UPDATE)

Triggers: audit_process_versions, process_versions_guard, process_versions_no_delete, process_versions_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `process_id` | uuid | not null |
| `version_no` | integer | not null |
| `state_kind` | text | not null |
| `status` | text | not null |
| `based_on_version_id` | uuid |  |
| `trigger_text` | text |  |
| `start_event` | text |  |
| `end_event` | text |  |
| `frequency_text` | text |  |
| `volume_text` | text |  |
| `customer_text` | text |  |
| `output_text` | text |  |
| `change_summary` | text |  |
| `created_by_membership_id` | uuid |  |
| `approved_by_membership_id` | uuid |  |
| `approved_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, approved_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, based_on_version_id) REFERENCES process_versions(company_id, id)
- FOREIGN KEY (company_id, created_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, process_id) REFERENCES processes(company_id, id)

### `processes`
RLS: enabled · Policies: `processes_insert` (INSERT), `processes_read` (SELECT), `processes_update` (UPDATE)

Triggers: audit_processes, processes_updated

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `purpose` | text |  |
| `owner_department_id` | uuid | not null |
| `owner_membership_id` | uuid |  |
| `classification` | text | not null |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |
| `updated_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)
- FOREIGN KEY (company_id, owner_department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id, owner_membership_id) REFERENCES memberships(company_id, id)

### `prompt_versions`
RLS: enabled · Policies: `pv2_read` (SELECT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `prompt_key` | text | not null |
| `version` | integer | not null |
| `purpose` | text | not null |
| `template_sha256` | text | not null |
| `output_schema` | jsonb | not null |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `question_templates`
RLS: enabled · Policies: `qt_read` (SELECT), `qt_update` (UPDATE), `qt_write` (INSERT)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `version` | integer | not null |
| `scope_type` | text | not null |
| `field_key` | text | not null |
| `question_text` | text | not null |
| `help_text` | text |  |
| `answer_type` | text | not null |
| `choices` | jsonb |  |
| `branch_rules` | jsonb | not null |
| `status` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `role_assignments`
RLS: enabled · Policies: `role_assignments_insert` (INSERT), `role_assignments_read` (SELECT), `role_assignments_update` (UPDATE)

Triggers: audit_role_assignments, role_assignments_guard

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `membership_id` | uuid | not null |
| `role_id` | uuid | not null |
| `scope_type` | text | not null |
| `scope_department_id` | uuid |  |
| `scope_process_id` | uuid |  |
| `valid_from` | timestamp with time zone | not null |
| `valid_to` | timestamp with time zone |  |
| `status` | text | not null |
| `delegated_from_id` | uuid |  |
| `delegation_reason` | text |  |
| `granted_by_membership_id` | uuid |  |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id, delegated_from_id) REFERENCES role_assignments(company_id, id)
- FOREIGN KEY (company_id, granted_by_membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, membership_id) REFERENCES memberships(company_id, id)
- FOREIGN KEY (company_id, role_id) REFERENCES roles(company_id, id)
- FOREIGN KEY (company_id, scope_department_id) REFERENCES departments(company_id, id)
- FOREIGN KEY (company_id, scope_process_id) REFERENCES processes(company_id, id)

### `role_permissions`
RLS: enabled · Policies: `role_permissions_read` (SELECT), `role_permissions_write` (INSERT)

Triggers: audit_role_permissions

| Column | Type | Null |
|---|---|---|
| `company_id` | uuid | not null |
| `role_id` | uuid | not null |
| `permission_code` | text | not null |

Foreign keys:
- FOREIGN KEY (company_id, role_id) REFERENCES roles(company_id, id) ON DELETE CASCADE
- FOREIGN KEY (permission_code) REFERENCES permissions(code)

### `roles`
RLS: enabled · Policies: `roles_read` (SELECT), `roles_write` (INSERT)

Triggers: audit_roles

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `company_id` | uuid | not null |
| `code` | text | not null |
| `name` | text | not null |
| `description` | text |  |
| `is_candidate` | boolean | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (company_id) REFERENCES companies(id)

### `user_profiles`
RLS: enabled · Policies: `user_profiles_read` (SELECT), `user_profiles_self` (UPDATE)

Triggers: —

| Column | Type | Null |
|---|---|---|
| `id` | uuid | not null |
| `display_name` | text | not null |
| `created_at` | timestamp with time zone | not null |

Foreign keys:
- FOREIGN KEY (id) REFERENCES auth.users(id)
