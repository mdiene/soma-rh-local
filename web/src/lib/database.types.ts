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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      additional_salaries: {
        Row: {
          amount: number
          component_code: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          period: string
        }
        Insert: {
          amount: number
          component_code: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          period: string
        }
        Update: {
          amount?: number
          component_code?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "additional_salaries_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "salary_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "additional_salaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_salaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      attendance: {
        Row: {
          absence_hours: number
          attendance_date: string
          created_at: string
          employee_id: string
          id: string
          leave_application_id: string | null
          notes: string | null
          overtime_100: number
          overtime_15: number
          overtime_40: number
          overtime_60: number
          sick_hours: number
          status: string
          updated_at: string
          updated_by: string | null
          working_hours: number | null
        }
        Insert: {
          absence_hours?: number
          attendance_date: string
          created_at?: string
          employee_id: string
          id?: string
          leave_application_id?: string | null
          notes?: string | null
          overtime_100?: number
          overtime_15?: number
          overtime_40?: number
          overtime_60?: number
          sick_hours?: number
          status: string
          updated_at?: string
          updated_by?: string | null
          working_hours?: number | null
        }
        Update: {
          absence_hours?: number
          attendance_date?: string
          created_at?: string
          employee_id?: string
          id?: string
          leave_application_id?: string | null
          notes?: string | null
          overtime_100?: number
          overtime_15?: number
          overtime_40?: number
          overtime_60?: number
          sick_hours?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          working_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "attendance_leave_application_id_fkey"
            columns: ["leave_application_id"]
            isOneToOne: false
            referencedRelation: "leave_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          reason: string | null
          record_id: string | null
          record_key: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          reason?: string | null
          record_id?: string | null
          record_key?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          reason?: string | null
          record_id?: string | null
          record_key?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_manager_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_manager_assignments_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_agreements: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          legal_form: string | null
          logo_url: string | null
          name: string
          ninea: string | null
          phone: string | null
          rccm: string | null
          share_capital: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          legal_form?: string | null
          logo_url?: string | null
          name: string
          ninea?: string | null
          phone?: string | null
          rccm?: string | null
          share_capital?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          legal_form?: string | null
          logo_url?: string | null
          name?: string
          ninea?: string | null
          phone?: string | null
          rccm?: string | null
          share_capital?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      contract_types: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          label: string
          nature: string
          precarity_eligible: boolean
          severance_eligible: boolean
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          label: string
          nature?: string
          precarity_eligible?: boolean
          severance_eligible?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          label?: string
          nature?: string
          precarity_eligible?: boolean
          severance_eligible?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
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
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      designations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      employee_grades: {
        Row: {
          agreement_code: string
          base_salary: number
          code: string
          created_at: string
          effective_from: string
          grade_class: string | null
          hourly_rate: number
          id: string
          is_active: boolean
          staff_status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agreement_code: string
          base_salary: number
          code: string
          created_at?: string
          effective_from?: string
          grade_class?: string | null
          hourly_rate: number
          id?: string
          is_active?: boolean
          staff_status: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agreement_code?: string
          base_salary?: number
          code?: string
          created_at?: string
          effective_from?: string
          grade_class?: string | null
          hourly_rate?: number
          id?: string
          is_active?: boolean
          staff_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_grades_agreement_code_fkey"
            columns: ["agreement_code"]
            isOneToOne: false
            referencedRelation: "collective_agreements"
            referencedColumns: ["code"]
          },
        ]
      }
      employee_request_history: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          note: string | null
          request_id: string
          status: string
        }
        Insert: {
          actor_id?: string
          created_at?: string
          id?: string
          note?: string | null
          request_id: string
          status: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          note?: string | null
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "employee_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          request_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          request_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          request_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "employee_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_manager_assignments: {
        Row: {
          created_at: string
          delegated_by: string
          employee_id: string
          id: string
          manager_employee_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          delegated_by?: string
          employee_id: string
          id?: string
          manager_employee_id: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          delegated_by?: string
          employee_id?: string
          id?: string
          manager_employee_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          address: string | null
          agreement_code: string | null
          bank_account: string | null
          bank_name: string | null
          children_count: number
          company_id: string
          contract_end: string | null
          contract_start: string | null
          created_at: string
          css_number: string | null
          date_of_birth: string | null
          date_of_joining: string
          department_id: string | null
          designation_id: string | null
          email_personal: string | null
          email_work: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_number: string
          employment_type: string
          exit_reason: string | null
          father_name: string | null
          first_name: string
          gender: string | null
          grade_id: string | null
          id: string
          id_document_number: string | null
          id_expiry_date: string | null
          id_issue_date: string | null
          ipres_number: string | null
          ir_parts: number
          last_name: string
          leave_return_date: string | null
          marital_status: string | null
          mother_name: string | null
          nationality: string | null
          ninea: string | null
          payment_mode: string
          phone_personal: string | null
          phone_work: string | null
          place_of_birth: string | null
          relieving_date: string | null
          spouses_count: number
          status: string
          trimf_parts: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          agreement_code?: string | null
          bank_account?: string | null
          bank_name?: string | null
          children_count?: number
          company_id: string
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          css_number?: string | null
          date_of_birth?: string | null
          date_of_joining: string
          department_id?: string | null
          designation_id?: string | null
          email_personal?: string | null
          email_work?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_number: string
          employment_type: string
          exit_reason?: string | null
          father_name?: string | null
          first_name: string
          gender?: string | null
          grade_id?: string | null
          id?: string
          id_document_number?: string | null
          id_expiry_date?: string | null
          id_issue_date?: string | null
          ipres_number?: string | null
          ir_parts?: number
          last_name: string
          leave_return_date?: string | null
          marital_status?: string | null
          mother_name?: string | null
          nationality?: string | null
          ninea?: string | null
          payment_mode?: string
          phone_personal?: string | null
          phone_work?: string | null
          place_of_birth?: string | null
          relieving_date?: string | null
          spouses_count?: number
          status?: string
          trimf_parts?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          agreement_code?: string | null
          bank_account?: string | null
          bank_name?: string | null
          children_count?: number
          company_id?: string
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          css_number?: string | null
          date_of_birth?: string | null
          date_of_joining?: string
          department_id?: string | null
          designation_id?: string | null
          email_personal?: string | null
          email_work?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_number?: string
          employment_type?: string
          exit_reason?: string | null
          father_name?: string | null
          first_name?: string
          gender?: string | null
          grade_id?: string | null
          id?: string
          id_document_number?: string | null
          id_expiry_date?: string | null
          id_issue_date?: string | null
          ipres_number?: string | null
          ir_parts?: number
          last_name?: string
          leave_return_date?: string | null
          marital_status?: string | null
          mother_name?: string | null
          nationality?: string | null
          ninea?: string | null
          payment_mode?: string
          phone_personal?: string | null
          phone_work?: string | null
          place_of_birth?: string | null
          relieving_date?: string | null
          spouses_count?: number
          status?: string
          trimf_parts?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_agreement_code_fkey"
            columns: ["agreement_code"]
            isOneToOne: false
            referencedRelation: "collective_agreements"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_employment_type_fkey"
            columns: ["employment_type"]
            isOneToOne: false
            referencedRelation: "contract_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "employees_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "employee_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_payment_mode_fkey"
            columns: ["payment_mode"]
            isOneToOne: false
            referencedRelation: "payment_modes"
            referencedColumns: ["code"]
          },
        ]
      }
      employee_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          checksum: string | null
          created_at: string
          created_by: string
          document_type: string
          document_slot: number
          employee_id: string
          file_name: string
          id: string
          mime_type: string
          rejection_reason: string | null
          requirement_code: string | null
          size_bytes: number
          status: string
          storage_path: string
          thumbnail_path: string | null
          submitted_at: string | null
          title: string
          current_version: number
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string
          document_type: string
          document_slot?: number
          employee_id: string
          file_name: string
          id?: string
          mime_type: string
          rejection_reason?: string | null
          requirement_code?: string | null
          size_bytes: number
          status?: string
          storage_path: string
          thumbnail_path?: string | null
          submitted_at?: string | null
          title: string
          current_version?: number
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string
          document_type?: string
          document_slot?: number
          employee_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          rejection_reason?: string | null
          requirement_code?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          thumbnail_path?: string | null
          submitted_at?: string | null
          title?: string
          current_version?: number
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_document_access_log: {
        Row: {
          accessed_at: string
          document_id: string
          id: string
          user_id: string
        }
        Insert: {
          accessed_at?: string
          document_id: string
          id?: string
          user_id?: string
        }
        Update: {
          accessed_at?: string
          document_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_document_access_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "employee_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requirements: {
        Row: {
          active: boolean
          allowed_mime_types: string[]
          code: string
          conditional_rule: string | null
          created_at: string
          description: string
          icon: string | null
          manager_shareable: boolean
          max_size_bytes: number
          required: boolean
          section_code: string
          sort_order: number
          title: string
          validity_days: number | null
        }
        Insert: {
          active?: boolean
          allowed_mime_types?: string[]
          code: string
          conditional_rule?: string | null
          created_at?: string
          description: string
          icon?: string | null
          manager_shareable?: boolean
          max_size_bytes?: number
          required?: boolean
          section_code: string
          sort_order?: number
          title: string
          validity_days?: number | null
        }
        Update: {
          active?: boolean
          allowed_mime_types?: string[]
          code?: string
          conditional_rule?: string | null
          created_at?: string
          description?: string
          icon?: string | null
          manager_shareable?: boolean
          max_size_bytes?: number
          required?: boolean
          section_code?: string
          sort_order?: number
          title?: string
          validity_days?: number | null
        }
        Relationships: []
      }
      document_reviews: {
        Row: {
          document_id: string
          id: string
          reason: string | null
          reviewed_at: string
          reviewed_by: string
          status: string
        }
        Insert: {
          document_id: string
          id?: string
          reason?: string | null
          reviewed_at?: string
          reviewed_by?: string
          status: string
        }
        Update: {
          document_id?: string
          id?: string
          reason?: string | null
          reviewed_at?: string
          reviewed_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "employee_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          checksum: string | null
          document_id: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_at: string
          uploaded_by: string
          version_number: number
        }
        Insert: {
          checksum?: string | null
          document_id: string
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string
          version_number: number
        }
        Update: {
          checksum?: string | null
          document_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "employee_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ir_family_reductions: {
        Row: {
          id: string
          max_amount: number
          min_amount: number
          parts: number
          rate: number
          slab_id: string
        }
        Insert: {
          id?: string
          max_amount: number
          min_amount: number
          parts: number
          rate: number
          slab_id: string
        }
        Update: {
          id?: string
          max_amount?: number
          min_amount?: number
          parts?: number
          rate?: number
          slab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ir_family_reductions_slab_id_fkey"
            columns: ["slab_id"]
            isOneToOne: false
            referencedRelation: "tax_slabs"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_allocations: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          from_date: string
          id: string
          leave_type: string
          notes: string | null
          to_date: string
        }
        Insert: {
          created_at?: string
          days: number
          employee_id: string
          from_date: string
          id?: string
          leave_type: string
          notes?: string | null
          to_date: string
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          from_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_allocations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_allocations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_allocations_leave_type_fkey"
            columns: ["leave_type"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "leave_allocations_leave_type_fkey"
            columns: ["leave_type"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["leave_type"]
          },
        ]
      }
      leave_applications: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          from_date: string
          half_day: boolean
          id: string
          leave_type: string
          reason: string | null
          status: string
          to_date: string
          total_days: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          from_date: string
          half_day?: boolean
          id?: string
          leave_type: string
          reason?: string | null
          status?: string
          to_date: string
          total_days?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          from_date?: string
          half_day?: boolean
          id?: string
          leave_type?: string
          reason?: string | null
          status?: string
          to_date?: string
          total_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_applications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_applications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "leave_applications_leave_type_fkey"
            columns: ["leave_type"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "leave_applications_leave_type_fkey"
            columns: ["leave_type"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["leave_type"]
          },
        ]
      }
      leave_types: {
        Row: {
          affects_payroll: string
          code: string
          created_at: string
          days_per_month: number
          is_paid: boolean
          max_days_per_year: number | null
          name: string
        }
        Insert: {
          affects_payroll?: string
          code: string
          created_at?: string
          days_per_month?: number
          is_paid?: boolean
          max_days_per_year?: number | null
          name: string
        }
        Update: {
          affects_payroll?: string
          code?: string
          created_at?: string
          days_per_month?: number
          is_paid?: boolean
          max_days_per_year?: number | null
          name?: string
        }
        Relationships: []
      }
      payment_modes: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payroll_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          paid_at: string | null
          paid_by: string | null
          notes: string | null
          payment_mode: string
          period_end: string
          period_start: string
          period_id: string | null
          posting_date: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          status: string
          settings_snapshot: Json | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          notes?: string | null
          payment_mode?: string
          period_end: string
          period_start: string
          period_id?: string | null
          posting_date?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          status?: string
          settings_snapshot?: Json | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          notes?: string | null
          payment_mode?: string
          period_end?: string
          period_start?: string
          period_id?: string | null
          posting_date?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          status?: string
          settings_snapshot?: Json | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          period_end: string
          period_start: string
          reopened_at: string | null
          reopened_by: string | null
          reopen_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          period_end: string
          period_start: string
          reopened_at?: string | null
          reopened_by?: string | null
          reopen_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          period_end?: string
          period_start?: string
          reopened_at?: string | null
          reopened_by?: string | null
          reopen_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_anomalies: {
        Row: {
          code: string
          created_at: string
          employee_id: string | null
          id: string
          message: string
          payroll_entry_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          employee_id?: string | null
          id?: string
          message: string
          payroll_entry_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          message?: string
          payroll_entry_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: []
      }
      payroll_approvals: {
        Row: {
          actor_id: string
          comment: string | null
          created_at: string
          decision: string
          id: string
          payroll_entry_id: string
          role: string
        }
        Insert: {
          actor_id?: string
          comment?: string | null
          created_at?: string
          decision: string
          id?: string
          payroll_entry_id: string
          role: string
        }
        Update: {
          actor_id?: string
          comment?: string | null
          created_at?: string
          decision?: string
          id?: string
          payroll_entry_id?: string
          role?: string
        }
        Relationships: []
      }
      payroll_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          payload: Json
          payload_hash: string
          payroll_entry_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          payload: Json
          payload_hash: string
          payroll_entry_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          payload_hash?: string
          payroll_entry_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          payroll_entry_id: string | null
          reason: string | null
          resource_id: string | null
          resource_type: string
          result: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          payroll_entry_id?: string | null
          reason?: string | null
          resource_id?: string | null
          resource_type: string
          result?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          payroll_entry_id?: string | null
          reason?: string | null
          resource_id?: string | null
          resource_type?: string
          result?: string
        }
        Relationships: []
      }
      payroll_inputs: {
        Row: {
          absence_hours: number
          attendance_override: boolean
          created_at: string
          employee_id: string
          id: string
          leave_allowance: number
          meal_count: number
          notes: string | null
          overtime_100: number
          overtime_15: number
          overtime_40: number
          overtime_60: number
          period: string
          previous_rounding: number
          sick_leave_hours: number
          sick_leave_rate: number
          updated_at: string
        }
        Insert: {
          absence_hours?: number
          attendance_override?: boolean
          created_at?: string
          employee_id: string
          id?: string
          leave_allowance?: number
          meal_count?: number
          notes?: string | null
          overtime_100?: number
          overtime_15?: number
          overtime_40?: number
          overtime_60?: number
          period: string
          previous_rounding?: number
          sick_leave_hours?: number
          sick_leave_rate?: number
          updated_at?: string
        }
        Update: {
          absence_hours?: number
          attendance_override?: boolean
          created_at?: string
          employee_id?: string
          id?: string
          leave_allowance?: number
          meal_count?: number
          notes?: string | null
          overtime_100?: number
          overtime_15?: number
          overtime_40?: number
          overtime_60?: number
          period?: string
          previous_rounding?: number
          sick_leave_hours?: number
          sick_leave_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_inputs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_inputs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      payroll_settings: {
        Row: {
          brs_rate: number
          cfce_rate: number
          allowance_absence_basis: string
          created_at: string
          css_af_rate: number
          css_at_rate: number
          css_ceiling: number
          effective_from: string
          ipm_on_contractors: boolean
          severance_basis: string
          hourly_rate_divisor: number
          id: string
          ipm_ceiling: number
          ipm_employee_share: number
          ipm_rate: number
          ipres_rc_ceiling: number
          ipres_rc_employee_share: number
          ipres_rc_rate: number
          ipres_rg_ceiling: number
          ipres_rg_employee_share: number
          ipres_rg_rate: number
          ir_abatement_cap: number
          ir_abatement_rate: number
          km_allowance: number
          meal_allowance_factor: number
          monthly_hours: number
          precarity_rate: number
          seniority_min_years: number
          smig_hourly: number
          transport_allowance: number
        }
        Insert: {
          brs_rate?: number
          cfce_rate?: number
          allowance_absence_basis?: string
          created_at?: string
          css_af_rate?: number
          css_at_rate?: number
          css_ceiling?: number
          effective_from: string
          hourly_rate_divisor?: number
          id?: string
          ipm_ceiling?: number
          ipm_employee_share?: number
          ipm_rate?: number
          ipres_rc_ceiling?: number
          ipres_rc_employee_share?: number
          ipres_rc_rate?: number
          ipres_rg_ceiling?: number
          ipres_rg_employee_share?: number
          ipres_rg_rate?: number
          ir_abatement_cap?: number
          ir_abatement_rate?: number
          km_allowance?: number
          meal_allowance_factor?: number
          monthly_hours?: number
          precarity_rate?: number
          seniority_min_years?: number
          smig_hourly?: number
          transport_allowance?: number
        }
        Update: {
          brs_rate?: number
          cfce_rate?: number
          allowance_absence_basis?: string
          created_at?: string
          css_af_rate?: number
          css_at_rate?: number
          css_ceiling?: number
          effective_from?: string
          ipm_on_contractors?: boolean
          severance_basis?: string
          hourly_rate_divisor?: number
          id?: string
          ipm_ceiling?: number
          ipm_employee_share?: number
          ipm_rate?: number
          ipres_rc_ceiling?: number
          ipres_rc_employee_share?: number
          ipres_rc_rate?: number
          ipres_rg_ceiling?: number
          ipres_rg_employee_share?: number
          ipres_rg_rate?: number
          ir_abatement_cap?: number
          ir_abatement_rate?: number
          km_allowance?: number
          meal_allowance_factor?: number
          monthly_hours?: number
          precarity_rate?: number
          seniority_min_years?: number
          smig_hourly?: number
          transport_allowance?: number
        }
        Relationships: []
      }
      salary_components: {
        Row: {
          code: string
          component_type: string
          created_at: string
          description: string | null
          input_mode: string
          is_active: boolean
          name: string
          rubric_number: number | null
        }
        Insert: {
          code: string
          component_type: string
          created_at?: string
          description?: string | null
          input_mode?: string
          is_active?: boolean
          name: string
          rubric_number?: number | null
        }
        Update: {
          code?: string
          component_type?: string
          created_at?: string
          description?: string | null
          input_mode?: string
          is_active?: boolean
          name?: string
          rubric_number?: number | null
        }
        Relationships: []
      }
      salary_slip_details: {
        Row: {
          base: number | null
          component_code: string
          deduction_amount: number
          employee_rate: number | null
          employer_amount: number
          employer_rate: number | null
          gain_amount: number
          id: string
          label: string
          quantity: number | null
          salary_slip_id: string
          section: string
          sort_order: number
        }
        Insert: {
          base?: number | null
          component_code: string
          deduction_amount?: number
          employee_rate?: number | null
          employer_amount?: number
          employer_rate?: number | null
          gain_amount?: number
          id?: string
          label: string
          quantity?: number | null
          salary_slip_id: string
          section: string
          sort_order: number
        }
        Update: {
          base?: number | null
          component_code?: string
          deduction_amount?: number
          employee_rate?: number | null
          employer_amount?: number
          employer_rate?: number | null
          gain_amount?: number
          id?: string
          label?: string
          quantity?: number | null
          salary_slip_id?: string
          section?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_slip_details_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "salary_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "salary_slip_details_salary_slip_id_fkey"
            columns: ["salary_slip_id"]
            isOneToOne: false
            referencedRelation: "salary_slips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_slip_details_salary_slip_id_fkey"
            columns: ["salary_slip_id"]
            isOneToOne: false
            referencedRelation: "v_payroll_register"
            referencedColumns: ["salary_slip_id"]
          },
          {
            foreignKeyName: "salary_slip_details_salary_slip_id_fkey"
            columns: ["salary_slip_id"]
            isOneToOne: false
            referencedRelation: "v_salary_slip_ytd"
            referencedColumns: ["salary_slip_id"]
          },
        ]
      }
      salary_slips: {
        Row: {
          address: string | null
          calculation: Json | null
          children_count: number | null
          contract_situation: string | null
          created_at: string
          css_base: number
          date_of_joining: string | null
          designation: string | null
          employee_id: string
          employee_name: string
          employee_number: string
          employer_charges: number
          employment_type: string | null
          grade_class: string | null
          grade_code: string | null
          gross_pay: number
          hourly_rate: number | null
          id: string
          income_tax: number
          ipm_base: number
          ipres_rc_base: number
          ipres_rg_base: number
          ir_parts: number | null
          leave_provision: number
          marital_status: string | null
          net_pay: number
          net_remuneration: number
          payment_mode: string | null
          payroll_cost: number
          payroll_entry_id: string | null
          period_end: string
          period_start: string
          precarity_provision: number
          seniority_months: number | null
          seniority_years: number | null
          spouses_count: number | null
          staff_status: string | null
          status: string
          total_employee_deductions: number
          total_net_deductions: number
          total_non_taxable: number
          trimf: number
          trimf_parts: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          calculation?: Json | null
          children_count?: number | null
          contract_situation?: string | null
          created_at?: string
          css_base?: number
          date_of_joining?: string | null
          designation?: string | null
          employee_id: string
          employee_name: string
          employee_number: string
          employer_charges?: number
          employment_type?: string | null
          grade_class?: string | null
          grade_code?: string | null
          gross_pay?: number
          hourly_rate?: number | null
          id?: string
          income_tax?: number
          ipm_base?: number
          ipres_rc_base?: number
          ipres_rg_base?: number
          ir_parts?: number | null
          leave_provision?: number
          marital_status?: string | null
          net_pay?: number
          net_remuneration?: number
          payment_mode?: string | null
          payroll_cost?: number
          payroll_entry_id?: string | null
          period_end: string
          period_start: string
          precarity_provision?: number
          seniority_months?: number | null
          seniority_years?: number | null
          spouses_count?: number | null
          staff_status?: string | null
          status?: string
          total_employee_deductions?: number
          total_net_deductions?: number
          total_non_taxable?: number
          trimf?: number
          trimf_parts?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          calculation?: Json | null
          children_count?: number | null
          contract_situation?: string | null
          created_at?: string
          css_base?: number
          date_of_joining?: string | null
          designation?: string | null
          employee_id?: string
          employee_name?: string
          employee_number?: string
          employer_charges?: number
          employment_type?: string | null
          grade_class?: string | null
          grade_code?: string | null
          gross_pay?: number
          hourly_rate?: number | null
          id?: string
          income_tax?: number
          ipm_base?: number
          ipres_rc_base?: number
          ipres_rg_base?: number
          ir_parts?: number | null
          leave_provision?: number
          marital_status?: string | null
          net_pay?: number
          net_remuneration?: number
          payment_mode?: string | null
          payroll_cost?: number
          payroll_entry_id?: string | null
          period_end?: string
          period_start?: string
          precarity_provision?: number
          seniority_months?: number | null
          seniority_years?: number | null
          spouses_count?: number | null
          staff_status?: string | null
          status?: string
          total_employee_deductions?: number
          total_net_deductions?: number
          total_non_taxable?: number
          trimf?: number
          trimf_parts?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_slips_payroll_entry_id_fkey"
            columns: ["payroll_entry_id"]
            isOneToOne: false
            referencedRelation: "payroll_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_structure_assignments: {
        Row: {
          base_salary: number | null
          created_at: string
          employee_id: string
          fees: number
          from_date: string
          id: string
          leave_paid_monthly: boolean
          notes: string | null
          other_fixed: number
          structure_id: string
          sursalaire: number
          target_net: number | null
          transport_mode: string
          updated_at: string
        }
        Insert: {
          base_salary?: number | null
          created_at?: string
          employee_id: string
          fees?: number
          from_date: string
          id?: string
          leave_paid_monthly?: boolean
          notes?: string | null
          other_fixed?: number
          structure_id: string
          sursalaire?: number
          target_net?: number | null
          transport_mode?: string
          updated_at?: string
        }
        Update: {
          base_salary?: number | null
          created_at?: string
          employee_id?: string
          fees?: number
          from_date?: string
          id?: string
          leave_paid_monthly?: boolean
          notes?: string | null
          other_fixed?: number
          structure_id?: string
          sursalaire?: number
          target_net?: number | null
          transport_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_structure_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_structure_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_structure_assignments_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "salary_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_structure_components: {
        Row: {
          component_code: string
          sort_order: number
          structure_id: string
        }
        Insert: {
          component_code: string
          sort_order?: number
          structure_id: string
        }
        Update: {
          component_code?: string
          sort_order?: number
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_structure_components_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "salary_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "salary_structure_components_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "salary_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_structures: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_structures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_slab_brackets: {
        Row: {
          from_amount: number
          id: string
          rate: number
          slab_id: string
        }
        Insert: {
          from_amount: number
          id?: string
          rate: number
          slab_id: string
        }
        Update: {
          from_amount?: number
          id?: string
          rate?: number
          slab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_slab_brackets_slab_id_fkey"
            columns: ["slab_id"]
            isOneToOne: false
            referencedRelation: "tax_slabs"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_slabs: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      trimf_brackets: {
        Row: {
          annual_amount: number
          id: string
          min_annual_gross: number
          per_part: boolean
          slab_id: string
        }
        Insert: {
          annual_amount: number
          id?: string
          min_annual_gross: number
          per_part?: boolean
          slab_id: string
        }
        Update: {
          annual_amount?: number
          id?: string
          min_annual_gross?: number
          per_part?: boolean
          slab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trimf_brackets_slab_id_fkey"
            columns: ["slab_id"]
            isOneToOne: false
            referencedRelation: "tax_slabs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_accounting_journal: {
        Row: {
          account: string | null
          credit: number | null
          debit: number | null
          journal: string | null
          label: string | null
          line_no: number | null
          payroll_entry_id: string | null
          period_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_slips_payroll_entry_id_fkey"
            columns: ["payroll_entry_id"]
            isOneToOne: false
            referencedRelation: "payroll_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v_contribution_summary: {
        Row: {
          base_total: number | null
          component_code: string | null
          employee_amount: number | null
          employee_rate: number | null
          employer_amount: number | null
          employer_rate: number | null
          headcount: number | null
          label: string | null
          payroll_entry_id: string | null
          period_start: string | null
          sort_order: number | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_slip_details_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "salary_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "salary_slips_payroll_entry_id_fkey"
            columns: ["payroll_entry_id"]
            isOneToOne: false
            referencedRelation: "payroll_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v_leave_balances: {
        Row: {
          allocated: number | null
          balance: number | null
          employee_id: string | null
          employee_number: string | null
          first_name: string | null
          last_name: string | null
          leave_type: string | null
          leave_type_name: string | null
          taken: number | null
        }
        Relationships: []
      }
      v_payroll_register: {
        Row: {
          base_salary: number | null
          brs: number | null
          cfce: number | null
          contract_situation: string | null
          css_af: number | null
          css_at: number | null
          designation: string | null
          employee_id: string | null
          employee_name: string | null
          employee_number: string | null
          employer_charges: number | null
          employment_type: string | null
          grade_code: string | null
          gross_pay: number | null
          income_tax: number | null
          ipm_employee: number | null
          ipm_employer: number | null
          ipres_rc_employee: number | null
          ipres_rc_employer: number | null
          ipres_rc_total: number | null
          ipres_rg_employee: number | null
          ipres_rg_employer: number | null
          ipres_rg_total: number | null
          is_validated: boolean | null
          km_allowance: number | null
          leave_allowance: number | null
          leave_provision: number | null
          meal_allowance: number | null
          net_pay: number | null
          net_remuneration: number | null
          overtime_amount: number | null
          payroll_cost: number | null
          payroll_entry_id: string | null
          period_start: string | null
          precarity_allowance: number | null
          precarity_provision: number | null
          previous_rounding: number | null
          salary_slip_id: string | null
          seniority_bonus: number | null
          staff_status: string | null
          status: string | null
          sursalaire: number | null
          total_employee_deductions: number | null
          total_net_deductions: number | null
          total_non_taxable: number | null
          transport_allowance: number | null
          trimf: number | null
          variable_gross: number | null
          ytd_gross: number | null
          ytd_ipres_rc: number | null
          ytd_ipres_rg: number | null
          ytd_leave_provision: number | null
          ytd_net_pay: number | null
          ytd_payroll_cost: number | null
          ytd_precarity_provision: number | null
          ytd_trimf: number | null
          ytd_validated_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "salary_slips_payroll_entry_id_fkey"
            columns: ["payroll_entry_id"]
            isOneToOne: false
            referencedRelation: "payroll_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      v_salary_slip_ytd: {
        Row: {
          employee_id: string | null
          period_start: string | null
          salary_slip_id: string | null
          ytd_gross: number | null
          ytd_income_tax: number | null
          ytd_ipres_rc: number | null
          ytd_ipres_rg: number | null
          ytd_leave_provision: number | null
          ytd_net_pay: number | null
          ytd_payroll_cost: number | null
          ytd_precarity_provision: number | null
          ytd_trimf: number | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_leave_balances"
            referencedColumns: ["employee_id"]
          },
        ]
      }
    }
    Functions: {
      admin_change_employee_number: {
        Args: { p_employee_id: string; p_new_number: string; p_reason: string }
        Returns: string
      }
      admin_link_employee: {
        Args: { p_employee_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          employee_id: string
          employee_number: string
          last_sign_in_at: string | null
          roles: string[]
          user_id: string
        }[]
      }
      calculate_salary_slip: {
        Args: {
          p_employee_id: string
          p_payroll_entry_id?: string
          p_period_end: string
          p_period_start: string
        }
        Returns: string
      }
      cancel_payroll_entry: {
        Args: { p_payroll_entry_id: string }
        Returns: undefined
      }
      payroll_entry_checks: { Args: { p_payroll_entry_id: string }; Returns: Json }
      review_employee_document: {
        Args: { p_document_id: string; p_reason?: string | null; p_status: string }
        Returns: {
          checksum: string | null
          created_at: string
          created_by: string
          current_version: number
          document_type: string
          employee_id: string
          file_name: string
          id: string
          mime_type: string
          rejection_reason: string | null
          requirement_code: string | null
          size_bytes: number
          status: string
          storage_path: string
          submitted_at: string | null
          title: string
          validated_at: string | null
          validated_by: string | null
        }
      }
      archive_employee_document: {
        Args: { p_document_id: string }
        Returns: {
          archived_at: string | null
          archived_by: string | null
          checksum: string | null
          created_at: string
          created_by: string
          current_version: number
          document_type: string
          employee_id: string
          file_name: string
          id: string
          mime_type: string
          rejection_reason: string | null
          requirement_code: string | null
          size_bytes: number
          status: string
          storage_path: string
          submitted_at: string | null
          title: string
          validated_at: string | null
          validated_by: string | null
        }
      }
      claim_first_admin: { Args: never; Returns: boolean }
      compute_income_tax: {
        Args: { p_date: string; p_monthly_gross: number; p_parts: number }
        Returns: Json
      }
      compute_salary_slip: {
        Args: {
          p_employee_id: string
          p_period_end: string
          p_period_start: string
          p_sursalaire?: number
        }
        Returns: Json
      }
      compute_trimf: {
        Args: { p_date: string; p_monthly_gross: number; p_parts: number }
        Returns: number
      }
      delete_payroll_entry: {
        Args: { p_payroll_entry_id: string }
        Returns: number
      }
      decide_employee_request: {
        Args: { p_note?: string | null; p_request_id: string; p_status: string }
        Returns: {
          amount: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          employee_id: string
          id: string
          message: string | null
          request_type: string
          status: string
          target_date: string | null
        }
      }
      mark_employee_notification_read: {
        Args: { p_notification_id: string }
        Returns: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          request_id: string | null
          title: string
          user_id: string
        }
      }
      manager_has_employee: {
        Args: { p_employee_id: string; p_on_date?: string }
        Returns: boolean
      }
      assign_manager_employee: {
        Args: { p_employee_id: string; p_manager_employee_id: string; p_valid_from: string; p_valid_to?: string | null }
        Returns: {
          created_at: string
          delegated_by: string
          employee_id: string
          id: string
          manager_employee_id: string
          valid_from: string
          valid_to: string | null
        }
      }
      close_manager_assignment: {
        Args: { p_assignment_id: string; p_valid_to: string }
        Returns: {
          created_at: string
          delegated_by: string
          employee_id: string
          id: string
          manager_employee_id: string
          valid_from: string
          valid_to: string | null
        }
      }
      log_employee_document_access: {
        Args: { p_document_id: string }
        Returns: {
          accessed_at: string
          document_id: string
          id: string
          user_id: string
        }
      }
      create_payroll_snapshot: {
        Args: { p_payroll_entry_id: string }
        Returns: string
      }
      transition_payroll_entry: {
        Args: { p_payroll_entry_id: string; p_target_status: string; p_reason?: string | null }
        Returns: string
      }
      excel_datedif: {
        Args: { p_end: string; p_start: string; p_unit: string }
        Returns: number
      }
      has_role: { Args: { p_roles: string[] }; Returns: boolean }
      hr_dashboard: { Args: { p_period?: string }; Returns: Json }
      hr_dashboard_year: { Args: { p_year: number }; Returns: Json }
      my_employee_id: { Args: never; Returns: string }
      next_employee_number: { Args: never; Returns: string }
      payroll_settings_at: {
        Args: { p_date: string }
        Returns: {
          brs_rate: number
          cfce_rate: number
          created_at: string
          css_af_rate: number
          css_at_rate: number
          css_ceiling: number
          effective_from: string
          hourly_rate_divisor: number
          id: string
          ipm_ceiling: number
          ipm_employee_share: number
          ipm_rate: number
          ipres_rc_ceiling: number
          ipres_rc_employee_share: number
          ipres_rc_rate: number
          ipres_rg_ceiling: number
          ipres_rg_employee_share: number
          ipres_rg_rate: number
          ir_abatement_cap: number
          ir_abatement_rate: number
          km_allowance: number
          meal_allowance_factor: number
          monthly_hours: number
          precarity_rate: number
          seniority_min_years: number
          smig_hourly: number
          transport_allowance: number
        }
        SetofOptions: {
          from: "*"
          to: "payroll_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      preview_employee_number: { Args: never; Returns: string }
      reference_usage: {
        Args: { p_key: string; p_table: string }
        Returns: Json
      }
      run_payroll_entry: { Args: { p_payroll_entry_id: string }; Returns: Json }
      severance_coefficient: {
        Args: { p_entry: string; p_exit: string; p_kind: string }
        Returns: number
      }
      solve_sursalaire_for_net: {
        Args: {
          p_employee_id: string
          p_period_end: string
          p_period_start: string
          p_target_net: number
        }
        Returns: number
      }
      submit_payroll_entry: {
        Args: { p_payroll_entry_id: string }
        Returns: undefined
      }
      sync_attendance_to_payroll_inputs: {
        Args: { p_period: string }
        Returns: number
      }
      tax_slab_at: { Args: { p_date: string }; Returns: string }
      user_emails: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          id: string
        }[]
      }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected"
      category_type: "income" | "expense" | "other"
      contact_type: "customer" | "vendor"
      document_status:
        | "draft"
        | "sent"
        | "viewed"
        | "partial"
        | "paid"
        | "cancelled"
      document_total_type: "sub_total" | "tax" | "discount" | "total"
      document_type: "invoice" | "invoice_recurring" | "bill" | "bill_recurring"
      risk_level: "low" | "medium" | "high"
      role:
        | "owner"
        | "admin"
        | "finance"
        | "hr"
        | "staff"
        | "agent_service_account"
      tax_type: "normal" | "fixed" | "withholding"
      transaction_type:
        | "income"
        | "expense"
        | "income_transfer"
        | "expense_transfer"
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
    Enums: {
      approval_status: ["pending", "approved", "rejected"],
      category_type: ["income", "expense", "other"],
      contact_type: ["customer", "vendor"],
      document_status: [
        "draft",
        "sent",
        "viewed",
        "partial",
        "paid",
        "cancelled",
      ],
      document_total_type: ["sub_total", "tax", "discount", "total"],
      document_type: ["invoice", "invoice_recurring", "bill", "bill_recurring"],
      risk_level: ["low", "medium", "high"],
      role: [
        "owner",
        "admin",
        "finance",
        "hr",
        "staff",
        "agent_service_account",
      ],
      tax_type: ["normal", "fixed", "withholding"],
      transaction_type: [
        "income",
        "expense",
        "income_transfer",
        "expense_transfer",
      ],
    },
  },
} as const
