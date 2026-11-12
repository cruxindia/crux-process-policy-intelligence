export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_connection_assignments: {
        Row: {
          active: boolean
          company_id: string
          connection_id: string
          created_at: string
          department_id: string | null
          id: string
          interview_category: string | null
          process_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          connection_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          interview_category?: string | null
          process_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          connection_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          interview_category?: string | null
          process_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_connection_assignments_company_id_connection_id_fkey"
            columns: ["company_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_connections"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "ai_connection_assignments_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "ai_connection_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_connection_assignments_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "ai_connection_assignments_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          company_id: string
          completed_at: string | null
          connection_id: string | null
          created_at: string
          error_class: string | null
          id: string
          idempotency_key: string
          membership_id: string | null
          payload_ref: Json
          priority: number
          process_id: string | null
          retry_count: number
          run_after: string
          session_id: string | null
          started_at: string | null
          status: string
          task_type: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          error_class?: string | null
          id?: string
          idempotency_key: string
          membership_id?: string | null
          payload_ref?: Json
          priority?: number
          process_id?: string | null
          retry_count?: number
          run_after?: string
          session_id?: string | null
          started_at?: string | null
          status?: string
          task_type: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          error_class?: string | null
          id?: string
          idempotency_key?: string
          membership_id?: string | null
          payload_ref?: Json
          priority?: number
          process_id?: string | null
          retry_count?: number
          run_after?: string
          session_id?: string | null
          started_at?: string | null
          status?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_company_id_connection_id_fkey"
            columns: ["company_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_connections"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "ai_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_company_id_membership_id_fkey"
            columns: ["company_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "ai_jobs_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "discovered_processes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "ai_jobs_company_id_session_id_fkey"
            columns: ["company_id", "session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      ai_provider_connections: {
        Row: {
          base_url: string | null
          company_id: string
          cooldown_until: string | null
          created_at: string
          gcp_project_id: string | null
          health: string
          id: string
          key_set_at: string | null
          last_error_at: string | null
          last_error_class: string | null
          last_success_at: string | null
          last_tested_at: string | null
          model: string
          name: string
          policy_provider: string
          priority: number
          provider: string
          status: string
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          base_url?: string | null
          company_id: string
          cooldown_until?: string | null
          created_at?: string
          gcp_project_id?: string | null
          health?: string
          id?: string
          key_set_at?: string | null
          last_error_at?: string | null
          last_error_class?: string | null
          last_success_at?: string | null
          last_tested_at?: string | null
          model?: string
          name: string
          policy_provider: string
          priority?: number
          provider: string
          status?: string
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          base_url?: string | null
          company_id?: string
          cooldown_until?: string | null
          created_at?: string
          gcp_project_id?: string | null
          health?: string
          id?: string
          key_set_at?: string | null
          last_error_at?: string | null
          last_error_class?: string | null
          last_success_at?: string | null
          last_tested_at?: string | null
          model?: string
          name?: string
          policy_provider?: string
          priority?: number
          provider?: string
          status?: string
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_provider_connections_company_id_policy_provider_fkey"
            columns: ["company_id", "policy_provider"]
            isOneToOne: false
            referencedRelation: "ai_provider_policies"
            referencedColumns: ["company_id", "provider"]
          },
        ]
      }
      ai_provider_policies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          max_classification: string
          may_train_on_inputs: boolean
          notes: string | null
          provider: string
          status: string
          terms_checked_on: string
          training_acceptance_note: string | null
          training_accepted_by_membership_id: string | null
          training_accepted_on: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          max_classification: string
          may_train_on_inputs: boolean
          notes?: string | null
          provider: string
          status?: string
          terms_checked_on: string
          training_acceptance_note?: string | null
          training_accepted_by_membership_id?: string | null
          training_accepted_on?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          max_classification?: string
          may_train_on_inputs?: boolean
          notes?: string | null
          provider?: string
          status?: string
          terms_checked_on?: string
          training_acceptance_note?: string | null
          training_accepted_by_membership_id?: string | null
          training_accepted_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_policies_accepted_by_fkey"
            columns: ["company_id", "training_accepted_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "ai_provider_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          capability: string
          company_id: string
          connection_id: string | null
          context_source_ids: string[]
          created_at: string
          data_classification: string
          error_text: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_sha256: string | null
          invalid_source_ref_count: number | null
          model: string
          output_sha256: string | null
          prompt_version_id: string
          provider: string
          requested_by_membership_id: string | null
          schema_valid: boolean | null
          status: string
          unsupported_claim_count: number | null
        }
        Insert: {
          capability: string
          company_id: string
          connection_id?: string | null
          context_source_ids?: string[]
          created_at?: string
          data_classification: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_sha256?: string | null
          invalid_source_ref_count?: number | null
          model: string
          output_sha256?: string | null
          prompt_version_id: string
          provider: string
          requested_by_membership_id?: string | null
          schema_valid?: boolean | null
          status?: string
          unsupported_claim_count?: number | null
        }
        Update: {
          capability?: string
          company_id?: string
          connection_id?: string | null
          context_source_ids?: string[]
          created_at?: string
          data_classification?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_sha256?: string | null
          invalid_source_ref_count?: number | null
          model?: string
          output_sha256?: string | null
          prompt_version_id?: string
          provider?: string
          requested_by_membership_id?: string | null
          schema_valid?: boolean | null
          status?: string
          unsupported_claim_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_company_id_prompt_version_id_fkey"
            columns: ["company_id", "prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "ai_runs_company_id_requested_by_membership_id_fkey"
            columns: ["company_id", "requested_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "ai_runs_connection_fkey"
            columns: ["company_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_connections"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      approval_decisions: {
        Row: {
          comment: string | null
          company_id: string
          content_sha256: string | null
          decided_at: string
          decided_by_membership_id: string
          decision: string
          id: string
          step_no: number
          version_id: string
        }
        Insert: {
          comment?: string | null
          company_id: string
          content_sha256?: string | null
          decided_at?: string
          decided_by_membership_id: string
          decision: string
          id?: string
          step_no: number
          version_id: string
        }
        Update: {
          comment?: string | null
          company_id?: string
          content_sha256?: string | null
          decided_at?: string
          decided_by_membership_id?: string
          decision?: string
          id?: string
          step_no?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_company_id_decided_by_membership_id_fkey"
            columns: ["company_id", "decided_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "approval_decisions_company_id_version_id_fkey"
            columns: ["company_id", "version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      approval_route_steps: {
        Row: {
          company_id: string
          required_approvals: number
          required_permission: string
          route_id: string
          step_kind: string
          step_no: number
        }
        Insert: {
          company_id: string
          required_approvals?: number
          required_permission: string
          route_id: string
          step_kind: string
          step_no: number
        }
        Update: {
          company_id?: string
          required_approvals?: number
          required_permission?: string
          route_id?: string
          step_kind?: string
          step_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_route_steps_company_id_route_id_fkey"
            columns: ["company_id", "route_id"]
            isOneToOne: false
            referencedRelation: "approval_routes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "approval_route_steps_required_permission_fkey"
            columns: ["required_permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      approval_routes: {
        Row: {
          code: string
          company_id: string
          created_at: string
          distinct_approvers: boolean
          document_type_id: string | null
          id: string
          name: string
          segregate_author: boolean
          status: string
          version: number
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          distinct_approvers?: boolean
          document_type_id?: string | null
          id?: string
          name: string
          segregate_author?: boolean
          status?: string
          version?: number
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          distinct_approvers?: boolean
          document_type_id?: string | null
          id?: string
          name?: string
          segregate_author?: boolean
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_routes_company_id_document_type_id_fkey"
            columns: ["company_id", "document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "approval_routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          changed_fields: string[] | null
          company_id: string
          correlation_id: string | null
          id: number
          object_id: string
          object_type: string
          occurred_at: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          changed_fields?: string[] | null
          company_id: string
          correlation_id?: string | null
          id?: never
          object_id: string
          object_type: string
          occurred_at?: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          changed_fields?: string[] | null
          company_id?: string
          correlation_id?: string | null
          id?: never
          object_id?: string
          object_type?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          finished_at: string | null
          id: number
          idempotency_key: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_after: string
          status: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          finished_at?: string | null
          id?: never
          idempotency_key: string
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          finished_at?: string | null
          id?: never
          idempotency_key?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clarification_responses: {
        Row: {
          company_id: string
          created_at: string
          evidence_file_id: string | null
          id: string
          responder_membership_id: string
          response_text: string
          task_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          evidence_file_id?: string | null
          id?: string
          responder_membership_id: string
          response_text: string
          task_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          evidence_file_id?: string | null
          id?: string
          responder_membership_id?: string
          response_text?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clarification_responses_company_id_evidence_file_id_fkey"
            columns: ["company_id", "evidence_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "clarification_responses_company_id_responder_membership_id_fkey"
            columns: ["company_id", "responder_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "clarification_responses_company_id_task_id_fkey"
            columns: ["company_id", "task_id"]
            isOneToOne: false
            referencedRelation: "clarification_tasks"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      clarification_tasks: {
        Row: {
          assignee_department_id: string
          assignee_membership_id: string | null
          code: string
          company_id: string
          context_text: string | null
          created_at: string
          due_at: string | null
          escalation_level: number
          id: string
          idempotency_key: string | null
          knowledge_record_id: string | null
          outcome_text: string | null
          priority: string
          process_id: string | null
          question_text: string
          requester_membership_id: string
          requesting_department_id: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assignee_department_id: string
          assignee_membership_id?: string | null
          code?: string
          company_id: string
          context_text?: string | null
          created_at?: string
          due_at?: string | null
          escalation_level?: number
          id?: string
          idempotency_key?: string | null
          knowledge_record_id?: string | null
          outcome_text?: string | null
          priority?: string
          process_id?: string | null
          question_text: string
          requester_membership_id: string
          requesting_department_id: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assignee_department_id?: string
          assignee_membership_id?: string | null
          code?: string
          company_id?: string
          context_text?: string | null
          created_at?: string
          due_at?: string | null
          escalation_level?: number
          id?: string
          idempotency_key?: string | null
          knowledge_record_id?: string | null
          outcome_text?: string | null
          priority?: string
          process_id?: string | null
          question_text?: string
          requester_membership_id?: string
          requesting_department_id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clarification_tasks_company_id_assignee_department_id_fkey"
            columns: ["company_id", "assignee_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "clarification_tasks_company_id_assignee_membership_id_fkey"
            columns: ["company_id", "assignee_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "clarification_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarification_tasks_company_id_knowledge_record_id_fkey"
            columns: ["company_id", "knowledge_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "clarification_tasks_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "clarification_tasks_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "clarification_tasks_company_id_requester_membership_id_fkey"
            columns: ["company_id", "requester_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "clarification_tasks_company_id_requesting_department_id_fkey"
            columns: ["company_id", "requesting_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      companies: {
        Row: {
          ai_connection_limit: number
          code: string
          created_at: string
          id: string
          name: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          ai_connection_limit?: number
          code: string
          created_at?: string
          id?: string
          name: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          ai_connection_limit?: number
          code?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_join_links: {
        Row: {
          campaign_id: string
          company_id: string
          created_at: string
          created_by_membership_id: string | null
          department_id: string
          id: string
          label: string
          max_per_day: number
          status: string
          token_sha256: string
        }
        Insert: {
          campaign_id: string
          company_id: string
          created_at?: string
          created_by_membership_id?: string | null
          department_id: string
          id?: string
          label: string
          max_per_day?: number
          status?: string
          token_sha256: string
        }
        Update: {
          campaign_id?: string
          company_id?: string
          created_at?: string
          created_by_membership_id?: string | null
          department_id?: string
          id?: string
          label?: string
          max_per_day?: number
          status?: string
          token_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_join_links_company_id_campaign_id_fkey"
            columns: ["company_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "interview_campaigns"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "company_join_links_company_id_created_by_membership_id_fkey"
            columns: ["company_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "company_join_links_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "company_join_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          mandate: string | null
          name: string
          parent_department_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          mandate?: string | null
          name: string
          parent_department_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          mandate?: string | null
          name?: string
          parent_department_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_company_id_parent_department_id_fkey"
            columns: ["company_id", "parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      discovered_process_flows: {
        Row: {
          ai_run_id: string
          company_id: string
          created_at: string
          flow: Json
          id: string
          process_id: string
          version: number
        }
        Insert: {
          ai_run_id: string
          company_id: string
          created_at?: string
          flow: Json
          id?: string
          process_id: string
          version: number
        }
        Update: {
          ai_run_id?: string
          company_id?: string
          created_at?: string
          flow?: Json
          id?: string
          process_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "discovered_process_flows_company_id_ai_run_id_fkey"
            columns: ["company_id", "ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "discovered_process_flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovered_process_flows_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "discovered_processes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      discovered_processes: {
        Row: {
          company_id: string
          completeness: number
          coverage: Json
          created_at: string
          departments: string[]
          first_ai_run_id: string | null
          flow: Json
          flow_version: number
          frequency: string | null
          id: string
          importance: string | null
          involvement: string | null
          last_ai_run_id: string | null
          linked_process_id: string | null
          membership_id: string
          name: string
          owner_text: string | null
          process_key: string
          purpose: string | null
          session_id: string
          status: string
          updated_at: string
          volume: string | null
        }
        Insert: {
          company_id: string
          completeness?: number
          coverage?: Json
          created_at?: string
          departments?: string[]
          first_ai_run_id?: string | null
          flow?: Json
          flow_version?: number
          frequency?: string | null
          id?: string
          importance?: string | null
          involvement?: string | null
          last_ai_run_id?: string | null
          linked_process_id?: string | null
          membership_id: string
          name: string
          owner_text?: string | null
          process_key: string
          purpose?: string | null
          session_id: string
          status?: string
          updated_at?: string
          volume?: string | null
        }
        Update: {
          company_id?: string
          completeness?: number
          coverage?: Json
          created_at?: string
          departments?: string[]
          first_ai_run_id?: string | null
          flow?: Json
          flow_version?: number
          frequency?: string | null
          id?: string
          importance?: string | null
          involvement?: string | null
          last_ai_run_id?: string | null
          linked_process_id?: string | null
          membership_id?: string
          name?: string
          owner_text?: string | null
          process_key?: string
          purpose?: string | null
          session_id?: string
          status?: string
          updated_at?: string
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discovered_processes_company_id_first_ai_run_id_fkey"
            columns: ["company_id", "first_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "discovered_processes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovered_processes_company_id_last_ai_run_id_fkey"
            columns: ["company_id", "last_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "discovered_processes_company_id_linked_process_id_fkey"
            columns: ["company_id", "linked_process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "discovered_processes_company_id_linked_process_id_fkey"
            columns: ["company_id", "linked_process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "discovered_processes_company_id_membership_id_fkey"
            columns: ["company_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "discovered_processes_company_id_session_id_fkey"
            columns: ["company_id", "session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      discovery_profiles: {
        Row: {
          company_id: string
          focus_process_key: string | null
          inventory_confirmed: boolean
          last_ai_run_id: string | null
          membership_id: string
          profile: Json
          responsibilities: Json
          session_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          company_id: string
          focus_process_key?: string | null
          inventory_confirmed?: boolean
          last_ai_run_id?: string | null
          membership_id: string
          profile?: Json
          responsibilities?: Json
          session_id: string
          stage?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          focus_process_key?: string | null
          inventory_confirmed?: boolean
          last_ai_run_id?: string | null
          membership_id?: string
          profile?: Json
          responsibilities?: Json
          session_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_profiles_company_id_last_ai_run_id_fkey"
            columns: ["company_id", "last_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "discovery_profiles_company_id_membership_id_fkey"
            columns: ["company_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "discovery_profiles_company_id_session_id_fkey"
            columns: ["company_id", "session_id"]
            isOneToOne: true
            referencedRelation: "interview_sessions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      dispute_decisions: {
        Row: {
          company_id: string
          decided_at: string
          decided_by_membership_id: string
          decision_text: string
          dispute_id: string
          id: string
          rationale: string
          resulting_actions: string | null
        }
        Insert: {
          company_id: string
          decided_at?: string
          decided_by_membership_id: string
          decision_text: string
          dispute_id: string
          id?: string
          rationale: string
          resulting_actions?: string | null
        }
        Update: {
          company_id?: string
          decided_at?: string
          decided_by_membership_id?: string
          decision_text?: string
          dispute_id?: string
          id?: string
          rationale?: string
          resulting_actions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_decisions_company_id_decided_by_membership_id_fkey"
            columns: ["company_id", "decided_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "dispute_decisions_company_id_dispute_id_fkey"
            columns: ["company_id", "dispute_id"]
            isOneToOne: true
            referencedRelation: "disputes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      dispute_positions: {
        Row: {
          company_id: string
          context_text: string | null
          created_at: string
          dispute_id: string
          evidence_file_id: string | null
          id: string
          knowledge_record_id: string | null
          participant_membership_id: string
          position_text: string
        }
        Insert: {
          company_id: string
          context_text?: string | null
          created_at?: string
          dispute_id: string
          evidence_file_id?: string | null
          id?: string
          knowledge_record_id?: string | null
          participant_membership_id: string
          position_text: string
        }
        Update: {
          company_id?: string
          context_text?: string | null
          created_at?: string
          dispute_id?: string
          evidence_file_id?: string | null
          id?: string
          knowledge_record_id?: string | null
          participant_membership_id?: string
          position_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_positions_company_id_dispute_id_fkey"
            columns: ["company_id", "dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "dispute_positions_company_id_evidence_file_id_fkey"
            columns: ["company_id", "evidence_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "dispute_positions_company_id_knowledge_record_id_fkey"
            columns: ["company_id", "knowledge_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "dispute_positions_company_id_participant_membership_id_fkey"
            columns: ["company_id", "participant_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      disputes: {
        Row: {
          clarification_task_id: string | null
          code: string
          company_id: string
          context_differences: string | null
          created_at: string
          decided_at: string | null
          decision_owner_membership_id: string
          department_id: string
          id: string
          idempotency_key: string | null
          impact_text: string | null
          issue_statement: string
          knowledge_record_id: string | null
          process_id: string | null
          raised_by_membership_id: string
          status: string
          updated_at: string
        }
        Insert: {
          clarification_task_id?: string | null
          code?: string
          company_id: string
          context_differences?: string | null
          created_at?: string
          decided_at?: string | null
          decision_owner_membership_id: string
          department_id: string
          id?: string
          idempotency_key?: string | null
          impact_text?: string | null
          issue_statement: string
          knowledge_record_id?: string | null
          process_id?: string | null
          raised_by_membership_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          clarification_task_id?: string | null
          code?: string
          company_id?: string
          context_differences?: string | null
          created_at?: string
          decided_at?: string | null
          decision_owner_membership_id?: string
          department_id?: string
          id?: string
          idempotency_key?: string | null
          impact_text?: string | null
          issue_statement?: string
          knowledge_record_id?: string | null
          process_id?: string | null
          raised_by_membership_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_company_id_clarification_task_id_fkey"
            columns: ["company_id", "clarification_task_id"]
            isOneToOne: false
            referencedRelation: "clarification_tasks"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "disputes_company_id_decision_owner_membership_id_fkey"
            columns: ["company_id", "decision_owner_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "disputes_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "disputes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_company_id_knowledge_record_id_fkey"
            columns: ["company_id", "knowledge_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "disputes_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "disputes_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "disputes_company_id_raised_by_membership_id_fkey"
            columns: ["company_id", "raised_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      document_acknowledgements: {
        Row: {
          acknowledged_at: string
          company_id: string
          id: string
          membership_id: string
          version_id: string
        }
        Insert: {
          acknowledged_at?: string
          company_id: string
          id?: string
          membership_id: string
          version_id: string
        }
        Update: {
          acknowledged_at?: string
          company_id?: string
          id?: string
          membership_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_acknowledgements_company_id_membership_id_fkey"
            columns: ["company_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_acknowledgements_company_id_version_id_fkey"
            columns: ["company_id", "version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      document_change_requests: {
        Row: {
          company_id: string
          created_at: string
          document_id: string
          id: string
          reason: string
          requested_by_membership_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          document_id: string
          id?: string
          reason: string
          requested_by_membership_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          document_id?: string
          id?: string
          reason?: string
          requested_by_membership_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_change_requests_company_id_document_id_fkey"
            columns: ["company_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_change_requests_company_id_requested_by_membershi_fkey"
            columns: ["company_id", "requested_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      document_distributions: {
        Row: {
          channel: string
          company_id: string
          delivered_at: string
          id: string
          membership_id: string
          version_id: string
        }
        Insert: {
          channel?: string
          company_id: string
          delivered_at?: string
          id?: string
          membership_id: string
          version_id: string
        }
        Update: {
          channel?: string
          company_id?: string
          delivered_at?: string
          id?: string
          membership_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_distributions_company_id_membership_id_fkey"
            columns: ["company_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_distributions_company_id_version_id_fkey"
            columns: ["company_id", "version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      document_types: {
        Row: {
          code: string
          company_id: string
          default_review_months: number | null
          id: string
          name: string
        }
        Insert: {
          code: string
          company_id: string
          default_review_months?: number | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          default_review_months?: number | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_version_sources: {
        Row: {
          company_id: string
          evidence_file_id: string | null
          id: string
          knowledge_record_id: string | null
          note: string | null
          process_version_id: string | null
          version_id: string
        }
        Insert: {
          company_id: string
          evidence_file_id?: string | null
          id?: string
          knowledge_record_id?: string | null
          note?: string | null
          process_version_id?: string | null
          version_id: string
        }
        Update: {
          company_id?: string
          evidence_file_id?: string | null
          id?: string
          knowledge_record_id?: string | null
          note?: string | null
          process_version_id?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_version_sources_company_id_evidence_file_id_fkey"
            columns: ["company_id", "evidence_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_version_sources_company_id_knowledge_record_id_fkey"
            columns: ["company_id", "knowledge_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_version_sources_company_id_process_version_id_fkey"
            columns: ["company_id", "process_version_id"]
            isOneToOne: false
            referencedRelation: "process_versions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_version_sources_company_id_version_id_fkey"
            columns: ["company_id", "version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      document_versions: {
        Row: {
          approved_at: string | null
          author_membership_id: string | null
          body_markdown: string
          change_summary: string | null
          company_id: string
          content_sha256: string | null
          created_at: string
          document_id: string
          effective_date: string | null
          emergency_reason: string | null
          id: string
          is_emergency: boolean
          published_at: string | null
          published_by_membership_id: string | null
          retrospective_review_due: string | null
          review_due_date: string | null
          route_id: string | null
          status: string
          submitted_at: string | null
          supersedes_version_id: string | null
          updated_at: string
          version_no: number
        }
        Insert: {
          approved_at?: string | null
          author_membership_id?: string | null
          body_markdown?: string
          change_summary?: string | null
          company_id: string
          content_sha256?: string | null
          created_at?: string
          document_id: string
          effective_date?: string | null
          emergency_reason?: string | null
          id?: string
          is_emergency?: boolean
          published_at?: string | null
          published_by_membership_id?: string | null
          retrospective_review_due?: string | null
          review_due_date?: string | null
          route_id?: string | null
          status?: string
          submitted_at?: string | null
          supersedes_version_id?: string | null
          updated_at?: string
          version_no: number
        }
        Update: {
          approved_at?: string | null
          author_membership_id?: string | null
          body_markdown?: string
          change_summary?: string | null
          company_id?: string
          content_sha256?: string | null
          created_at?: string
          document_id?: string
          effective_date?: string | null
          emergency_reason?: string | null
          id?: string
          is_emergency?: boolean
          published_at?: string | null
          published_by_membership_id?: string | null
          retrospective_review_due?: string | null
          review_due_date?: string | null
          route_id?: string | null
          status?: string
          submitted_at?: string | null
          supersedes_version_id?: string | null
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_company_id_author_membership_id_fkey"
            columns: ["company_id", "author_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_versions_company_id_document_id_fkey"
            columns: ["company_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_versions_company_id_published_by_membership_id_fkey"
            columns: ["company_id", "published_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_versions_company_id_route_id_fkey"
            columns: ["company_id", "route_id"]
            isOneToOne: false
            referencedRelation: "approval_routes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "document_versions_company_id_supersedes_version_id_fkey"
            columns: ["company_id", "supersedes_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      documents: {
        Row: {
          classification: string
          company_id: string
          created_at: string
          department_id: string
          doc_code: string
          document_type_id: string
          id: string
          owner_membership_id: string
          process_id: string | null
          status: string
          title: string
        }
        Insert: {
          classification?: string
          company_id: string
          created_at?: string
          department_id: string
          doc_code: string
          document_type_id: string
          id?: string
          owner_membership_id: string
          process_id?: string | null
          status?: string
          title: string
        }
        Update: {
          classification?: string
          company_id?: string
          created_at?: string
          department_id?: string
          doc_code?: string
          document_type_id?: string
          id?: string
          owner_membership_id?: string
          process_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "documents_company_id_document_type_id_fkey"
            columns: ["company_id", "document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_company_id_owner_membership_id_fkey"
            columns: ["company_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "documents_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "documents_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      evidence_files: {
        Row: {
          classification: string
          company_id: string
          created_at: string
          department_id: string
          id: string
          mime_type: string
          process_id: string | null
          review_note: string | null
          review_status: string
          sha256: string
          size_bytes: number
          source_date: string | null
          source_version: string | null
          storage_bucket: string
          storage_path: string
          title: string
          uploaded_by_membership_id: string
        }
        Insert: {
          classification?: string
          company_id: string
          created_at?: string
          department_id: string
          id?: string
          mime_type: string
          process_id?: string | null
          review_note?: string | null
          review_status?: string
          sha256: string
          size_bytes: number
          source_date?: string | null
          source_version?: string | null
          storage_bucket?: string
          storage_path: string
          title: string
          uploaded_by_membership_id: string
        }
        Update: {
          classification?: string
          company_id?: string
          created_at?: string
          department_id?: string
          id?: string
          mime_type?: string
          process_id?: string | null
          review_note?: string | null
          review_status?: string
          sha256?: string
          size_bytes?: number
          source_date?: string | null
          source_version?: string | null
          storage_bucket?: string
          storage_path?: string
          title?: string
          uploaded_by_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_files_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "evidence_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_files_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "evidence_files_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "evidence_files_company_id_uploaded_by_membership_id_fkey"
            columns: ["company_id", "uploaded_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_answer_analyses: {
        Row: {
          ai_run_id: string
          analysis: Json
          answer_id: string
          company_id: string
          created_at: string
          id: string
          session_id: string
          understood_answer: string
        }
        Insert: {
          ai_run_id: string
          analysis: Json
          answer_id: string
          company_id: string
          created_at?: string
          id?: string
          session_id: string
          understood_answer: string
        }
        Update: {
          ai_run_id?: string
          analysis?: Json
          answer_id?: string
          company_id?: string
          created_at?: string
          id?: string
          session_id?: string
          understood_answer?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_answer_analyses_company_id_ai_run_id_fkey"
            columns: ["company_id", "ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answer_analyses_company_id_answer_id_fkey"
            columns: ["company_id", "answer_id"]
            isOneToOne: false
            referencedRelation: "interview_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answer_analyses_company_id_answer_id_fkey"
            columns: ["company_id", "answer_id"]
            isOneToOne: false
            referencedRelation: "interview_current_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answer_analyses_company_id_session_id_fkey"
            columns: ["company_id", "session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_answer_drafts: {
        Row: {
          company_id: string
          draft_text: string | null
          question_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          draft_text?: string | null
          question_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          draft_text?: string | null
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_answer_drafts_company_id_question_id_fkey"
            columns: ["company_id", "question_id"]
            isOneToOne: true
            referencedRelation: "interview_questions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_answers: {
        Row: {
          answer_kind: string
          answer_text: string | null
          answered_at: string
          answered_by_membership_id: string
          company_id: string
          id: string
          knowledge_basis: string
          question_id: string
          referred_membership_id: string | null
          referred_note: string | null
          revision_no: number
          revision_reason: string | null
          supersedes_answer_id: string | null
        }
        Insert: {
          answer_kind?: string
          answer_text?: string | null
          answered_at?: string
          answered_by_membership_id: string
          company_id: string
          id?: string
          knowledge_basis?: string
          question_id: string
          referred_membership_id?: string | null
          referred_note?: string | null
          revision_no?: number
          revision_reason?: string | null
          supersedes_answer_id?: string | null
        }
        Update: {
          answer_kind?: string
          answer_text?: string | null
          answered_at?: string
          answered_by_membership_id?: string
          company_id?: string
          id?: string
          knowledge_basis?: string
          question_id?: string
          referred_membership_id?: string | null
          referred_note?: string | null
          revision_no?: number
          revision_reason?: string | null
          supersedes_answer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_answers_company_id_answered_by_membership_id_fkey"
            columns: ["company_id", "answered_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answers_company_id_question_id_fkey"
            columns: ["company_id", "question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answers_company_id_referred_membership_id_fkey"
            columns: ["company_id", "referred_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answers_company_id_supersedes_answer_id_fkey"
            columns: ["company_id", "supersedes_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answers_company_id_supersedes_answer_id_fkey"
            columns: ["company_id", "supersedes_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_current_answers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_assignments: {
        Row: {
          campaign_id: string
          company_id: string
          created_at: string
          department_id: string
          due_on: string | null
          id: string
          process_id: string | null
          respondent_membership_id: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          company_id: string
          created_at?: string
          department_id: string
          due_on?: string | null
          id?: string
          process_id?: string | null
          respondent_membership_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          company_id?: string
          created_at?: string
          department_id?: string
          due_on?: string | null
          id?: string
          process_id?: string | null
          respondent_membership_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_assignments_company_id_campaign_id_fkey"
            columns: ["company_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "interview_campaigns"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_assignments_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_assignments_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "interview_assignments_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_assignments_company_id_respondent_membership_id_fkey"
            columns: ["company_id", "respondent_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_campaigns: {
        Row: {
          ai_provider: string | null
          code: string
          company_id: string
          created_at: string
          department_id: string | null
          due_on: string | null
          id: string
          interview_mode: string
          max_ai_questions: number
          name: string
          owner_membership_id: string
          process_id: string | null
          purpose: string | null
          question_scopes: string[] | null
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_provider?: string | null
          code: string
          company_id: string
          created_at?: string
          department_id?: string | null
          due_on?: string | null
          id?: string
          interview_mode?: string
          max_ai_questions?: number
          name: string
          owner_membership_id: string
          process_id?: string | null
          purpose?: string | null
          question_scopes?: string[] | null
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_provider?: string | null
          code?: string
          company_id?: string
          created_at?: string
          department_id?: string | null
          due_on?: string | null
          id?: string
          interview_mode?: string
          max_ai_questions?: number
          name?: string
          owner_membership_id?: string
          process_id?: string | null
          purpose?: string | null
          question_scopes?: string[] | null
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_campaigns_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_campaigns_company_id_owner_membership_id_fkey"
            columns: ["company_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_campaigns_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "interview_campaigns_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_clarifications: {
        Row: {
          company_id: string
          created_at: string
          description: string
          earlier_answer_id: string
          id: string
          later_answer_id: string
          question_id: string | null
          raised_by_ai_run_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_ai_run_id: string | null
          session_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          earlier_answer_id: string
          id?: string
          later_answer_id: string
          question_id?: string | null
          raised_by_ai_run_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_ai_run_id?: string | null
          session_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          earlier_answer_id?: string
          id?: string
          later_answer_id?: string
          question_id?: string | null
          raised_by_ai_run_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_ai_run_id?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_clarifications_company_id_earlier_answer_id_fkey"
            columns: ["company_id", "earlier_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_clarifications_company_id_earlier_answer_id_fkey"
            columns: ["company_id", "earlier_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_current_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_clarifications_company_id_later_answer_id_fkey"
            columns: ["company_id", "later_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_clarifications_company_id_later_answer_id_fkey"
            columns: ["company_id", "later_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_current_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_clarifications_company_id_question_id_fkey"
            columns: ["company_id", "question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_clarifications_company_id_raised_by_ai_run_id_fkey"
            columns: ["company_id", "raised_by_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_clarifications_company_id_resolved_by_ai_run_id_fkey"
            columns: ["company_id", "resolved_by_ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_clarifications_company_id_session_id_fkey"
            columns: ["company_id", "session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_dimension_coverage: {
        Row: {
          ai_run_id: string | null
          company_id: string
          dimension: string
          note: string | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_run_id?: string | null
          company_id: string
          dimension: string
          note?: string | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_run_id?: string | null
          company_id?: string
          dimension?: string
          note?: string | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_dimension_coverage_company_id_ai_run_id_fkey"
            columns: ["company_id", "ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_dimension_coverage_company_id_session_id_fkey"
            columns: ["company_id", "session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_questions: {
        Row: {
          ai_run_id: string | null
          company_id: string
          created_at: string
          field_key: string
          generated_by: string
          id: string
          parent_question_id: string | null
          prompt_version_id: string | null
          question_text: string
          rationale: string | null
          seq: number
          session_id: string
          template_id: string | null
        }
        Insert: {
          ai_run_id?: string | null
          company_id: string
          created_at?: string
          field_key: string
          generated_by: string
          id?: string
          parent_question_id?: string | null
          prompt_version_id?: string | null
          question_text: string
          rationale?: string | null
          seq: number
          session_id: string
          template_id?: string | null
        }
        Update: {
          ai_run_id?: string | null
          company_id?: string
          created_at?: string
          field_key?: string
          generated_by?: string
          id?: string
          parent_question_id?: string | null
          prompt_version_id?: string | null
          question_text?: string
          rationale?: string | null
          seq?: number
          session_id?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_company_id_ai_run_id_fkey"
            columns: ["company_id", "ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_questions_company_id_parent_question_id_fkey"
            columns: ["company_id", "parent_question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_questions_company_id_prompt_version_id_fkey"
            columns: ["company_id", "prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_questions_company_id_session_id_fkey"
            columns: ["company_id", "session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_questions_company_id_template_id_fkey"
            columns: ["company_id", "template_id"]
            isOneToOne: false
            referencedRelation: "question_templates"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          assignment_id: string
          company_id: string
          id: string
          respondent_confirmed_at: string | null
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          started_at: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          company_id: string
          id?: string
          respondent_confirmed_at?: string | null
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          company_id?: string
          id?: string
          respondent_confirmed_at?: string | null
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_sessions_company_id_assignment_id_fkey"
            columns: ["company_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "interview_assignments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_sessions_company_id_reviewed_by_membership_id_fkey"
            columns: ["company_id", "reviewed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      knowledge_records: {
        Row: {
          ai_run_id: string | null
          approved_at: string | null
          approved_by_membership_id: string | null
          claim_origin: string
          claim_text: string
          classification: string
          company_id: string
          confidence: number | null
          confidence_rationale: string | null
          created_at: string
          created_by_membership_id: string | null
          department_id: string
          id: string
          lifecycle_status: string
          process_id: string | null
          record_code: string
          record_type: string
          state_kind: string
          supersedes_record_id: string | null
          title: string
          updated_at: string
          verified_at: string | null
          verified_by_membership_id: string | null
        }
        Insert: {
          ai_run_id?: string | null
          approved_at?: string | null
          approved_by_membership_id?: string | null
          claim_origin: string
          claim_text: string
          classification?: string
          company_id: string
          confidence?: number | null
          confidence_rationale?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          department_id: string
          id?: string
          lifecycle_status?: string
          process_id?: string | null
          record_code?: string
          record_type: string
          state_kind?: string
          supersedes_record_id?: string | null
          title: string
          updated_at?: string
          verified_at?: string | null
          verified_by_membership_id?: string | null
        }
        Update: {
          ai_run_id?: string | null
          approved_at?: string | null
          approved_by_membership_id?: string | null
          claim_origin?: string
          claim_text?: string
          classification?: string
          company_id?: string
          confidence?: number | null
          confidence_rationale?: string | null
          created_at?: string
          created_by_membership_id?: string | null
          department_id?: string
          id?: string
          lifecycle_status?: string
          process_id?: string | null
          record_code?: string
          record_type?: string
          state_kind?: string
          supersedes_record_id?: string | null
          title?: string
          updated_at?: string
          verified_at?: string | null
          verified_by_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_records_company_id_ai_run_id_fkey"
            columns: ["company_id", "ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_records_company_id_approved_by_membership_id_fkey"
            columns: ["company_id", "approved_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_records_company_id_created_by_membership_id_fkey"
            columns: ["company_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_records_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_records_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "knowledge_records_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_records_company_id_supersedes_record_id_fkey"
            columns: ["company_id", "supersedes_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_records_company_id_verified_by_membership_id_fkey"
            columns: ["company_id", "verified_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      knowledge_relationships: {
        Row: {
          company_id: string
          created_at: string
          from_record_id: string
          noted_by_membership_id: string | null
          relation: string
          to_record_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          from_record_id: string
          noted_by_membership_id?: string | null
          relation: string
          to_record_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          from_record_id?: string
          noted_by_membership_id?: string | null
          relation?: string
          to_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_relationships_company_id_from_record_id_fkey"
            columns: ["company_id", "from_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_relationships_company_id_to_record_id_fkey"
            columns: ["company_id", "to_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      knowledge_reviews: {
        Row: {
          action: string
          comment: string
          company_id: string
          created_at: string
          id: string
          knowledge_record_id: string
          reviewer_membership_id: string
        }
        Insert: {
          action: string
          comment: string
          company_id: string
          created_at?: string
          id?: string
          knowledge_record_id: string
          reviewer_membership_id: string
        }
        Update: {
          action?: string
          comment?: string
          company_id?: string
          created_at?: string
          id?: string
          knowledge_record_id?: string
          reviewer_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_reviews_company_id_knowledge_record_id_fkey"
            columns: ["company_id", "knowledge_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_reviews_company_id_reviewer_membership_id_fkey"
            columns: ["company_id", "reviewer_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          company_id: string
          created_at: string
          evidence_file_id: string | null
          external_reference: string | null
          id: string
          interview_answer_id: string | null
          knowledge_record_id: string
          linked_by_membership_id: string | null
          locator: string | null
          relation: string
          source_record_id: string | null
          source_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          evidence_file_id?: string | null
          external_reference?: string | null
          id?: string
          interview_answer_id?: string | null
          knowledge_record_id: string
          linked_by_membership_id?: string | null
          locator?: string | null
          relation?: string
          source_record_id?: string | null
          source_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          evidence_file_id?: string | null
          external_reference?: string | null
          id?: string
          interview_answer_id?: string | null
          knowledge_record_id?: string
          linked_by_membership_id?: string | null
          locator?: string | null
          relation?: string
          source_record_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_company_id_evidence_file_id_fkey"
            columns: ["company_id", "evidence_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_sources_company_id_interview_answer_id_fkey"
            columns: ["company_id", "interview_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_sources_company_id_interview_answer_id_fkey"
            columns: ["company_id", "interview_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_current_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_sources_company_id_knowledge_record_id_fkey"
            columns: ["company_id", "knowledge_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "knowledge_sources_company_id_source_record_id_fkey"
            columns: ["company_id", "source_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      legal_entities: {
        Row: {
          code: string
          company_id: string
          created_at: string
          entity_type: string | null
          id: string
          name: string
          status: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          entity_type?: string | null
          id?: string
          name: string
          status?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          entity_type?: string | null
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_entities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          location_type: string
          name: string
          parent_location_id: string | null
          status: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          location_type?: string
          name: string
          parent_location_id?: string | null
          status?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          location_type?: string
          name?: string
          parent_location_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_company_id_parent_location_id_fkey"
            columns: ["company_id", "parent_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_external: boolean
          job_title: string | null
          member_kind: string
          primary_department_id: string | null
          primary_location_id: string | null
          status: string
          updated_at: string
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_external?: boolean
          job_title?: string | null
          member_kind?: string
          primary_department_id?: string | null
          primary_location_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_external?: boolean
          job_title?: string | null
          member_kind?: string
          primary_department_id?: string | null
          primary_location_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_company_id_primary_department_id_fkey"
            columns: ["company_id", "primary_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "memberships_company_id_primary_location_id_fkey"
            columns: ["company_id", "primary_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          object_id: string | null
          object_type: string | null
          read_at: string | null
          recipient_membership_id: string
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          object_id?: string | null
          object_type?: string | null
          read_at?: string | null
          recipient_membership_id: string
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          object_id?: string | null
          object_type?: string | null
          read_at?: string | null
          recipient_membership_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_recipient_membership_id_fkey"
            columns: ["company_id", "recipient_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          description: string
        }
        Insert: {
          code: string
          description: string
        }
        Update: {
          code?: string
          description?: string
        }
        Relationships: []
      }
      process_departments: {
        Row: {
          company_id: string
          department_id: string
          process_id: string
          relation: string
        }
        Insert: {
          company_id: string
          department_id: string
          process_id: string
          relation: string
        }
        Update: {
          company_id?: string
          department_id?: string
          process_id?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_departments_company_id_department_id_fkey"
            columns: ["company_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "process_departments_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "process_departments_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      process_edges: {
        Row: {
          company_id: string
          condition_label: string | null
          created_at: string
          edge_type: string
          from_step_id: string
          id: string
          process_version_id: string
          to_step_id: string
        }
        Insert: {
          company_id: string
          condition_label?: string | null
          created_at?: string
          edge_type?: string
          from_step_id: string
          id?: string
          process_version_id: string
          to_step_id: string
        }
        Update: {
          company_id?: string
          condition_label?: string | null
          created_at?: string
          edge_type?: string
          from_step_id?: string
          id?: string
          process_version_id?: string
          to_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_edges_company_id_process_version_id_from_step_id_fkey"
            columns: ["company_id", "process_version_id", "from_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["company_id", "process_version_id", "id"]
          },
          {
            foreignKeyName: "process_edges_company_id_process_version_id_to_step_id_fkey"
            columns: ["company_id", "process_version_id", "to_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["company_id", "process_version_id", "id"]
          },
        ]
      }
      process_step_sources: {
        Row: {
          company_id: string
          created_at: string
          knowledge_record_id: string
          process_step_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          knowledge_record_id: string
          process_step_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          knowledge_record_id?: string
          process_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_step_sources_company_id_knowledge_record_id_fkey"
            columns: ["company_id", "knowledge_record_id"]
            isOneToOne: false
            referencedRelation: "knowledge_records"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "process_step_sources_company_id_process_step_id_fkey"
            columns: ["company_id", "process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      process_steps: {
        Row: {
          actor_role_text: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_assumption: boolean
          name: string
          performer_department_id: string | null
          process_version_id: string
          seq: number
          sla_text: string | null
          step_code: string
          step_type: string
          subprocess_id: string | null
          system_name: string | null
        }
        Insert: {
          actor_role_text?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_assumption?: boolean
          name: string
          performer_department_id?: string | null
          process_version_id: string
          seq: number
          sla_text?: string | null
          step_code: string
          step_type: string
          subprocess_id?: string | null
          system_name?: string | null
        }
        Update: {
          actor_role_text?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_assumption?: boolean
          name?: string
          performer_department_id?: string | null
          process_version_id?: string
          seq?: number
          sla_text?: string | null
          step_code?: string
          step_type?: string
          subprocess_id?: string | null
          system_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_steps_company_id_performer_department_id_fkey"
            columns: ["company_id", "performer_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "process_steps_company_id_process_version_id_fkey"
            columns: ["company_id", "process_version_id"]
            isOneToOne: false
            referencedRelation: "process_versions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "process_steps_company_id_subprocess_id_fkey"
            columns: ["company_id", "subprocess_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "process_steps_company_id_subprocess_id_fkey"
            columns: ["company_id", "subprocess_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      process_versions: {
        Row: {
          approved_at: string | null
          approved_by_membership_id: string | null
          based_on_version_id: string | null
          change_summary: string | null
          company_id: string
          created_at: string
          created_by_membership_id: string | null
          customer_text: string | null
          end_event: string | null
          frequency_text: string | null
          id: string
          output_text: string | null
          process_id: string
          start_event: string | null
          state_kind: string
          status: string
          trigger_text: string | null
          updated_at: string
          version_no: number
          volume_text: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_membership_id?: string | null
          based_on_version_id?: string | null
          change_summary?: string | null
          company_id: string
          created_at?: string
          created_by_membership_id?: string | null
          customer_text?: string | null
          end_event?: string | null
          frequency_text?: string | null
          id?: string
          output_text?: string | null
          process_id: string
          start_event?: string | null
          state_kind: string
          status?: string
          trigger_text?: string | null
          updated_at?: string
          version_no: number
          volume_text?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_membership_id?: string | null
          based_on_version_id?: string | null
          change_summary?: string | null
          company_id?: string
          created_at?: string
          created_by_membership_id?: string | null
          customer_text?: string | null
          end_event?: string | null
          frequency_text?: string | null
          id?: string
          output_text?: string | null
          process_id?: string
          start_event?: string | null
          state_kind?: string
          status?: string
          trigger_text?: string | null
          updated_at?: string
          version_no?: number
          volume_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_versions_company_id_approved_by_membership_id_fkey"
            columns: ["company_id", "approved_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "process_versions_company_id_based_on_version_id_fkey"
            columns: ["company_id", "based_on_version_id"]
            isOneToOne: false
            referencedRelation: "process_versions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "process_versions_company_id_created_by_membership_id_fkey"
            columns: ["company_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "process_versions_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "process_versions_company_id_process_id_fkey"
            columns: ["company_id", "process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      processes: {
        Row: {
          classification: string
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
          owner_department_id: string
          owner_membership_id: string | null
          purpose: string | null
          status: string
          updated_at: string
        }
        Insert: {
          classification?: string
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          owner_department_id: string
          owner_membership_id?: string | null
          purpose?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          classification?: string
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          owner_department_id?: string
          owner_membership_id?: string | null
          purpose?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_company_id_owner_department_id_fkey"
            columns: ["company_id", "owner_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "processes_company_id_owner_membership_id_fkey"
            columns: ["company_id", "owner_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          output_schema: Json
          prompt_key: string
          purpose: string
          status: string
          template_sha256: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          output_schema: Json
          prompt_key: string
          purpose: string
          status?: string
          template_sha256: string
          version: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          output_schema?: Json
          prompt_key?: string
          purpose?: string
          status?: string
          template_sha256?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      question_templates: {
        Row: {
          answer_type: string
          branch_rules: Json
          choices: Json | null
          code: string
          company_id: string
          created_at: string
          field_key: string
          help_text: string | null
          id: string
          question_text: string
          scope_type: string
          status: string
          version: number
        }
        Insert: {
          answer_type?: string
          branch_rules?: Json
          choices?: Json | null
          code: string
          company_id: string
          created_at?: string
          field_key: string
          help_text?: string | null
          id?: string
          question_text: string
          scope_type: string
          status?: string
          version?: number
        }
        Update: {
          answer_type?: string
          branch_rules?: Json
          choices?: Json | null
          code?: string
          company_id?: string
          created_at?: string
          field_key?: string
          help_text?: string | null
          id?: string
          question_text?: string
          scope_type?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          company_id: string
          created_at: string
          delegated_from_id: string | null
          delegation_reason: string | null
          granted_by_membership_id: string | null
          id: string
          membership_id: string
          role_id: string
          scope_department_id: string | null
          scope_process_id: string | null
          scope_type: string
          status: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          delegated_from_id?: string | null
          delegation_reason?: string | null
          granted_by_membership_id?: string | null
          id?: string
          membership_id: string
          role_id: string
          scope_department_id?: string | null
          scope_process_id?: string | null
          scope_type: string
          status?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          delegated_from_id?: string | null
          delegation_reason?: string | null
          granted_by_membership_id?: string | null
          id?: string
          membership_id?: string
          role_id?: string
          scope_department_id?: string | null
          scope_process_id?: string | null
          scope_type?: string
          status?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_company_id_delegated_from_id_fkey"
            columns: ["company_id", "delegated_from_id"]
            isOneToOne: false
            referencedRelation: "role_assignments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "role_assignments_company_id_granted_by_membership_id_fkey"
            columns: ["company_id", "granted_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "role_assignments_company_id_membership_id_fkey"
            columns: ["company_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "role_assignments_company_id_role_id_fkey"
            columns: ["company_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "role_assignments_company_id_scope_department_id_fkey"
            columns: ["company_id", "scope_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "role_assignments_company_id_scope_process_id_fkey"
            columns: ["company_id", "scope_process_id"]
            isOneToOne: false
            referencedRelation: "dashboard_process_status"
            referencedColumns: ["company_id", "process_id"]
          },
          {
            foreignKeyName: "role_assignments_company_id_scope_process_id_fkey"
            columns: ["company_id", "scope_process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          company_id: string
          permission_code: string
          role_id: string
        }
        Insert: {
          company_id: string
          permission_code: string
          role_id: string
        }
        Update: {
          company_id?: string
          permission_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_company_id_role_id_fkey"
            columns: ["company_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_candidate: boolean
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_candidate?: boolean
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_candidate?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_process_status: {
        Row: {
          company_id: string | null
          documents_in_approval: number | null
          documents_published: number | null
          knowledge_pending_review: number | null
          knowledge_verified: number | null
          latest_version_kind: string | null
          latest_version_no: number | null
          latest_version_status: string | null
          open_clarifications: number | null
          open_disputes: number | null
          open_hypotheses: number | null
          overdue_clarifications: number | null
          owner_department_id: string | null
          process_code: string | null
          process_id: string | null
          process_name: string | null
          process_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_company_id_owner_department_id_fkey"
            columns: ["company_id", "owner_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      interview_current_answers: {
        Row: {
          answer_kind: string | null
          answer_text: string | null
          answered_at: string | null
          answered_by_membership_id: string | null
          company_id: string | null
          id: string | null
          knowledge_basis: string | null
          question_id: string | null
          referred_membership_id: string | null
          referred_note: string | null
          revision_no: number | null
          revision_reason: string | null
          supersedes_answer_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_answers_company_id_answered_by_membership_id_fkey"
            columns: ["company_id", "answered_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answers_company_id_question_id_fkey"
            columns: ["company_id", "question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answers_company_id_referred_membership_id_fkey"
            columns: ["company_id", "referred_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answers_company_id_supersedes_answer_id_fkey"
            columns: ["company_id", "supersedes_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_answers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "interview_answers_company_id_supersedes_answer_id_fkey"
            columns: ["company_id", "supersedes_answer_id"]
            isOneToOne: false
            referencedRelation: "interview_current_answers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
    }
    Functions: {
      accept_membership: { Args: { p_company: string }; Returns: string }
      admin_reset_password: {
        Args: { p_company: string; p_membership: string }
        Returns: string
      }
      ai_connection_get_key: {
        Args: { p_company: string; p_connection: string }
        Returns: string
      }
      ai_connection_set_key: {
        Args: { p_company: string; p_connection: string; p_key: string }
        Returns: undefined
      }
      clear_password_marker: { Args: never; Returns: undefined }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      invite_member: {
        Args: {
          p_company: string
          p_department?: string
          p_display_name: string
          p_email: string
          p_job_title?: string
          p_role_code?: string
          p_scope_department?: string
        }
        Returns: Json
      }
      join_link_info: { Args: { p_token: string }; Returns: Json }
      load_starter_templates: { Args: { p_company: string }; Returns: number }
      member_contacts: {
        Args: { p_company: string }
        Returns: {
          email: string
          membership_id: string
          mobile: string
        }[]
      }
      mobile_login_id: { Args: { p_mobile: string }; Returns: string }
      my_contact: { Args: never; Returns: Json }
      my_discovery_assignment: { Args: { p_company: string }; Returns: string }
      my_permissions: { Args: { p_company: string }; Returns: string[] }
      normalise_mobile: { Args: { p: string }; Returns: string }
      password_change_required: { Args: never; Returns: boolean }
      process_map_issues: {
        Args: { p_version: string }
        Returns: {
          detail: string
          issue_type: string
          step_code: string
          step_id: string
        }[]
      }
      register_with_join_link: {
        Args: {
          p_email?: string
          p_full_name: string
          p_mobile: string
          p_password: string
          p_token: string
        }
        Returns: Json
      }
      reissue_temporary_password: {
        Args: { p_company: string; p_membership: string }
        Returns: string
      }
      set_join_interview_mode: {
        Args: { p_adaptive: boolean; p_company: string }
        Returns: string
      }
      start_interview_session: {
        Args: { p_assignment: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
