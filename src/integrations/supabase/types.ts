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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          detail: Json
          id: string
          note: string | null
          target_game_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          detail?: Json
          id?: string
          note?: string | null
          target_game_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          detail?: Json
          id?: string
          note?: string | null
          target_game_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_target_game_id_fkey"
            columns: ["target_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          request_type: string
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          request_type: string
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          request_type?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fairplay_actions: {
        Row: {
          action: string
          automatic: boolean
          created_at: string
          decided_by: string | null
          game_id: string | null
          id: string
          note: string | null
          score: number
          user_id: string
        }
        Insert: {
          action: string
          automatic?: boolean
          created_at?: string
          decided_by?: string | null
          game_id?: string | null
          id?: string
          note?: string | null
          score?: number
          user_id: string
        }
        Update: {
          action?: string
          automatic?: boolean
          created_at?: string
          decided_by?: string | null
          game_id?: string | null
          id?: string
          note?: string | null
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fairplay_actions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      fairplay_jobs: {
        Row: {
          analyzer_version: string
          attempts: number
          claimed_by: string | null
          depth: number | null
          engine_version: string | null
          finished_at: string | null
          game_id: string
          id: string
          last_error: string | null
          lease_until: string | null
          max_attempts: number
          queued_at: string
          started_at: string | null
          status: string
          time_budget_ms: number | null
          updated_at: string
        }
        Insert: {
          analyzer_version: string
          attempts?: number
          claimed_by?: string | null
          depth?: number | null
          engine_version?: string | null
          finished_at?: string | null
          game_id: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          max_attempts?: number
          queued_at?: string
          started_at?: string | null
          status?: string
          time_budget_ms?: number | null
          updated_at?: string
        }
        Update: {
          analyzer_version?: string
          attempts?: number
          claimed_by?: string | null
          depth?: number | null
          engine_version?: string | null
          finished_at?: string | null
          game_id?: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          max_attempts?: number
          queued_at?: string
          started_at?: string | null
          status?: string
          time_budget_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fairplay_jobs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      fairplay_reports: {
        Row: {
          action: string
          confidence: number
          contributions: Json
          created_at: string
          eval_ms: number
          features: Json
          game_id: string
          id: string
          model: string
          probability: number
          rating: number
          reasons: Json
          score: number
          user_id: string
        }
        Insert: {
          action?: string
          confidence?: number
          contributions?: Json
          created_at?: string
          eval_ms?: number
          features?: Json
          game_id: string
          id?: string
          model?: string
          probability?: number
          rating?: number
          reasons?: Json
          score?: number
          user_id: string
        }
        Update: {
          action?: string
          confidence?: number
          contributions?: Json
          created_at?: string
          eval_ms?: number
          features?: Json
          game_id?: string
          id?: string
          model?: string
          probability?: number
          rating?: number
          reasons?: Json
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fairplay_reports_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      fairplay_signals: {
        Row: {
          client_meta: Json
          created_at: string
          game_id: string
          id: string
          turns: Json
          user_id: string
        }
        Insert: {
          client_meta?: Json
          created_at?: string
          game_id: string
          id?: string
          turns?: Json
          user_id: string
        }
        Update: {
          client_meta?: Json
          created_at?: string
          game_id?: string
          id?: string
          turns?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fairplay_signals_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      fairplay_status: {
        Row: {
          action: string
          boosting_score: number
          games_reviewed: number
          lock_expires_at: string | null
          lock_hours: number
          lock_started_at: string | null
          rating_locked: boolean
          reasons: Json
          sandbagging_score: number
          score: number
          sprt_decision: string
          sprt_llr: number
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: string
          boosting_score?: number
          games_reviewed?: number
          lock_expires_at?: string | null
          lock_hours?: number
          lock_started_at?: string | null
          rating_locked?: boolean
          reasons?: Json
          sandbagging_score?: number
          score?: number
          sprt_decision?: string
          sprt_llr?: number
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          boosting_score?: number
          games_reviewed?: number
          lock_expires_at?: string | null
          lock_hours?: number
          lock_started_at?: string | null
          rating_locked?: boolean
          reasons?: Json
          sandbagging_score?: number
          score?: number
          sprt_decision?: string
          sprt_llr?: number
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      game_draw_offers: {
        Row: {
          created_at: string
          expires_at: string
          game_id: string
          game_version: number
          id: string
          idempotency_key: string
          offered_by: string
          offered_to: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          game_id: string
          game_version: number
          id?: string
          idempotency_key: string
          offered_by: string
          offered_to: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          game_id?: string
          game_version?: number
          id?: string
          idempotency_key?: string
          offered_by?: string
          offered_to?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_draw_offers_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_fairplay: {
        Row: {
          created_at: string
          engine_match: number
          flags: Json
          game_id: string
          hard_accuracy: number
          hard_move_match: number
          id: string
          suspicion: number
          time_cv: number
          user_id: string
        }
        Insert: {
          created_at?: string
          engine_match?: number
          flags?: Json
          game_id: string
          hard_accuracy?: number
          hard_move_match?: number
          id?: string
          suspicion?: number
          time_cv?: number
          user_id: string
        }
        Update: {
          created_at?: string
          engine_match?: number
          flags?: Json
          game_id?: string
          hard_accuracy?: number
          hard_move_match?: number
          id?: string
          suspicion?: number
          time_cv?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_fairplay_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_moves: {
        Row: {
          black_time_ms: number
          created_at: string
          fen: string
          game_id: string
          id: number
          move_number: number
          san: string
          uci: string
          white_time_ms: number
        }
        Insert: {
          black_time_ms: number
          created_at?: string
          fen: string
          game_id: string
          id?: number
          move_number: number
          san: string
          uci: string
          white_time_ms: number
        }
        Update: {
          black_time_ms?: number
          created_at?: string
          fen?: string
          game_id?: string
          id?: number
          move_number?: number
          san?: string
          uci?: string
          white_time_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          black_id: string
          black_rating: number
          black_time_ms: number
          clock_state: string
          created_at: string
          current_fen: string
          end_reason: string | null
          id: string
          increment_ms: number
          initial_fen: string
          last_move_at: string | null
          rated: boolean
          rating_applied_at: string | null
          result: string
          status: string
          time_control: string
          turn_started_at: string | null
          updated_at: string
          variant: string
          version: number
          white_id: string
          white_rating: number
          white_time_ms: number
          winner_id: string | null
        }
        Insert: {
          black_id: string
          black_rating: number
          black_time_ms?: number
          clock_state?: string
          created_at?: string
          current_fen?: string
          end_reason?: string | null
          id?: string
          increment_ms?: number
          initial_fen?: string
          last_move_at?: string | null
          rated?: boolean
          rating_applied_at?: string | null
          result?: string
          status?: string
          time_control?: string
          turn_started_at?: string | null
          updated_at?: string
          variant?: string
          version?: number
          white_id: string
          white_rating: number
          white_time_ms?: number
          winner_id?: string | null
        }
        Update: {
          black_id?: string
          black_rating?: number
          black_time_ms?: number
          clock_state?: string
          created_at?: string
          current_fen?: string
          end_reason?: string | null
          id?: string
          increment_ms?: number
          initial_fen?: string
          last_move_at?: string | null
          rated?: boolean
          rating_applied_at?: string | null
          result?: string
          status?: string
          time_control?: string
          turn_started_at?: string | null
          updated_at?: string
          variant?: string
          version?: number
          white_id?: string
          white_rating?: number
          white_time_ms?: number
          winner_id?: string | null
        }
        Relationships: []
      }
      matchmaking_queue: {
        Row: {
          created_at: string
          id: string
          matched_game_id: string | null
          rating: number
          status: string
          time_control: string
          updated_at: string
          user_id: string
          variant: string
        }
        Insert: {
          created_at?: string
          id?: string
          matched_game_id?: string | null
          rating?: number
          status?: string
          time_control?: string
          updated_at?: string
          user_id: string
          variant?: string
        }
        Update: {
          created_at?: string
          id?: string
          matched_game_id?: string | null
          rating?: number
          status?: string
          time_control?: string
          updated_at?: string
          user_id?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchmaking_queue_matched_game_id_fkey"
            columns: ["matched_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          actor_id: string | null
          attempts: number
          available_at: string
          created_at: string
          event_key: string
          event_type: string
          game_id: string | null
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          processed_at: string | null
          recipient_id: string
          schema_version: number
          status: string
        }
        Insert: {
          actor_id?: string | null
          attempts?: number
          available_at?: string
          created_at?: string
          event_key: string
          event_type: string
          game_id?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          recipient_id: string
          schema_version?: number
          status?: string
        }
        Update: {
          actor_id?: string | null
          attempts?: number
          available_at?: string
          created_at?: string
          event_key?: string
          event_type?: string
          game_id?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          recipient_id?: string
          schema_version?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          event_key: string | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          event_key?: string | null
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          event_key?: string | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offline_games: {
        Row: {
          client_id: string
          created_at: string
          id: string
          mode: string
          payload: Json
          played_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          mode?: string
          payload: Json
          played_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          mode?: string
          payload?: Json
          played_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_reports: {
        Row: {
          created_at: string
          game_id: string
          id: string
          note: string | null
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          note?: string | null
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subject_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          note?: string | null
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_reports_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          draws: number
          games_played: number
          id: string
          last_rated_at: string | null
          losses: number
          peak_rating: number
          rating: number
          rating_deviation: number
          updated_at: string
          volatility: number
          wins: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          draws?: number
          games_played?: number
          id: string
          last_rated_at?: string | null
          losses?: number
          peak_rating?: number
          rating?: number
          rating_deviation?: number
          updated_at?: string
          volatility?: number
          wins?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          draws?: number
          games_played?: number
          id?: string
          last_rated_at?: string | null
          losses?: number
          peak_rating?: number
          rating?: number
          rating_deviation?: number
          updated_at?: string
          volatility?: number
          wins?: number
        }
        Relationships: []
      }
      puzzle_attempts: {
        Row: {
          created_at: string
          grade: number
          id: string
          puzzle_id: string
          rating_after: number | null
          rating_before: number | null
          solved: boolean
          time_ms: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          grade: number
          id?: string
          puzzle_id: string
          rating_after?: number | null
          rating_before?: number | null
          solved?: boolean
          time_ms?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          grade?: number
          id?: string
          puzzle_id?: string
          rating_after?: number | null
          rating_before?: number | null
          solved?: boolean
          time_ms?: number | null
          user_id?: string
        }
        Relationships: []
      }
      puzzles: {
        Row: {
          attempts: number
          color: string
          created_at: string
          fen: string
          id: string
          ply: number
          rating: number
          solution: string
          solution_san: string | null
          solved: number
          source_game_id: string | null
          srs: Json
          swing: number
          themes: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          color?: string
          created_at?: string
          fen: string
          id: string
          ply?: number
          rating?: number
          solution: string
          solution_san?: string | null
          solved?: number
          source_game_id?: string | null
          srs?: Json
          swing?: number
          themes?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          color?: string
          created_at?: string
          fen?: string
          id?: string
          ply?: number
          rating?: number
          solution?: string
          solution_san?: string | null
          solved?: number
          source_game_id?: string | null
          srs?: Json
          swing?: number
          themes?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rating_events: {
        Row: {
          algorithm: string
          algorithm_version: number
          black_delta: number
          black_id: string
          black_rating_after: number
          black_rating_before: number
          black_rd_after: number
          black_rd_before: number
          black_volatility_after: number
          black_volatility_before: number
          created_at: string
          game_id: string
          id: string
          idempotency_key: string
          result: string
          white_delta: number
          white_id: string
          white_rating_after: number
          white_rating_before: number
          white_rd_after: number
          white_rd_before: number
          white_volatility_after: number
          white_volatility_before: number
        }
        Insert: {
          algorithm?: string
          algorithm_version?: number
          black_delta: number
          black_id: string
          black_rating_after: number
          black_rating_before: number
          black_rd_after: number
          black_rd_before: number
          black_volatility_after: number
          black_volatility_before: number
          created_at?: string
          game_id: string
          id?: string
          idempotency_key: string
          result: string
          white_delta: number
          white_id: string
          white_rating_after: number
          white_rating_before: number
          white_rd_after: number
          white_rd_before: number
          white_volatility_after: number
          white_volatility_before: number
        }
        Update: {
          algorithm?: string
          algorithm_version?: number
          black_delta?: number
          black_id?: string
          black_rating_after?: number
          black_rating_before?: number
          black_rd_after?: number
          black_rd_before?: number
          black_volatility_after?: number
          black_volatility_before?: number
          created_at?: string
          game_id?: string
          id?: string
          idempotency_key?: string
          result?: string
          white_delta?: number
          white_id?: string
          white_rating_after?: number
          white_rating_before?: number
          white_rd_after?: number
          white_rd_before?: number
          white_volatility_after?: number
          white_volatility_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          detail: Json
          error_code: string | null
          id: string
          kind: string
          message: string | null
          operation: string | null
          path: string | null
          resource: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          error_code?: string | null
          id?: string
          kind: string
          message?: string | null
          operation?: string | null
          path?: string | null
          resource?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          error_code?: string | null
          id?: string
          kind?: string
          message?: string | null
          operation?: string | null
          path?: string | null
          resource?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abort_game_internal: {
        Args: { _expected_version: number; _game_id: string; _user_id: string }
        Returns: Json
      }
      accept_draw_internal: {
        Args: {
          _expected_version: number
          _game_id: string
          _offer_id: string
          _user_id: string
        }
        Returns: Json
      }
      apply_glicko2: { Args: { _game_id: string }; Returns: undefined }
      apply_rating_once: { Args: { _game_id: string }; Returns: Json }
      claim_timeout_internal: {
        Args: { _expected_version: number; _game_id: string; _user_id: string }
        Returns: Json
      }
      clock_lag_grace_ms: { Args: never; Returns: number }
      commit_move_internal: {
        Args: {
          _end_reason: string
          _expected_version: number
          _fen: string
          _game_id: string
          _outcome: string
          _san: string
          _uci: string
          _user_id: string
        }
        Returns: Json
      }
      create_online_match: {
        Args: {
          _initial_fen: string
          _queue_id: string
          _user_id: string
          _white_is_requester: boolean
        }
        Returns: string
      }
      enqueue_notification: {
        Args: {
          _actor_id: string
          _event_key: string
          _event_type: string
          _game_id: string
          _payload: Json
          _recipient: string
        }
        Returns: undefined
      }
      expire_draw_offers: { Args: { _game_id: string }; Returns: undefined }
      fairplay_analyzer_version: { Args: never; Returns: string }
      fairplay_claim_jobs: {
        Args: { _lease_seconds?: number; _limit?: number; _worker: string }
        Returns: {
          analyzer_version: string
          attempts: number
          claimed_by: string | null
          depth: number | null
          engine_version: string | null
          finished_at: string | null
          game_id: string
          id: string
          last_error: string | null
          lease_until: string | null
          max_attempts: number
          queued_at: string
          started_at: string | null
          status: string
          time_budget_ms: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "fairplay_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fairplay_fail_job: {
        Args: { _error: string; _job_id: string }
        Returns: Json
      }
      fairplay_retry_job: { Args: { _job_id: string }; Returns: Json }
      fairplay_submit_analysis: {
        Args: {
          _depth: number
          _engine_version: string
          _job_id: string
          _subjects: Json
          _time_budget_ms: number
        }
        Returns: Json
      }
      finalize_expired_games: { Args: { _limit?: number }; Returns: Json }
      finalize_game_timeout: { Args: { _game_id: string }; Returns: Json }
      find_match: { Args: { _queue_id: string }; Returns: string }
      glicko2_update: {
        Args: {
          _opp_rating: number
          _opp_rd: number
          _rating: number
          _rd: number
          _score: number
          _sigma: number
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_security_event: {
        Args: {
          _detail?: Json
          _error_code?: string
          _kind: string
          _message?: string
          _operation?: string
          _path?: string
          _resource?: string
          _user_agent?: string
        }
        Returns: undefined
      }
      offer_draw_internal: {
        Args: {
          _expected_version: number
          _game_id: string
          _idempotency_key: string
          _user_id: string
        }
        Returns: Json
      }
      process_notification_outbox: { Args: { _limit?: number }; Returns: Json }
      queue_heartbeat: { Args: { _queue_id: string }; Returns: undefined }
      queue_join: {
        Args: { _time_control: string; _variant: string }
        Returns: {
          created_at: string
          id: string
          matched_game_id: string | null
          rating: number
          status: string
          time_control: string
          updated_at: string
          user_id: string
          variant: string
        }
        SetofOptions: {
          from: "*"
          to: "matchmaking_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_leave: { Args: never; Returns: undefined }
      resign_game_internal: {
        Args: { _expected_version: number; _game_id: string; _user_id: string }
        Returns: Json
      }
      respond_draw_internal: {
        Args: {
          _action: string
          _game_id: string
          _offer_id: string
          _user_id: string
        }
        Returns: Json
      }
      retry_notification_event: { Args: { _id: string }; Returns: Json }
      security_probe_alerts: {
        Args: { _threshold?: number; _window_minutes?: number }
        Returns: {
          events: number
          first_seen: string
          kinds: string[]
          last_seen: string
          resources: number
          user_id: string
        }[]
      }
      submit_player_report: {
        Args: { _game_id: string; _note?: string; _reason: string }
        Returns: Json
      }
      tc_increment_ms: { Args: { _time_control: string }; Returns: number }
      update_my_profile: {
        Args: { _avatar_url?: string; _display_name?: string }
        Returns: Json
      }
      update_ratings_after_game: {
        Args: { _game_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
