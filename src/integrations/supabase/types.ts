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
      account_deletion_jobs: {
        Row: {
          created_at: string
          grace_until: string
          id: string
          last_error: string | null
          mode: string
          processed_at: string | null
          reason: string
          requested_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grace_until: string
          id?: string
          last_error?: string | null
          mode?: string
          processed_at?: string | null
          reason: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grace_until?: string
          id?: string
          last_error?: string | null
          mode?: string
          processed_at?: string | null
          reason?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      admin_rating_adjustments: {
        Row: {
          actor_id: string
          created_at: string
          delta: number
          game_id: string | null
          id: string
          idempotency_key: string
          peak_after: number
          peak_before: number
          rating_after: number
          rating_before: number
          reason: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          delta: number
          game_id?: string | null
          id?: string
          idempotency_key: string
          peak_after: number
          peak_before: number
          rating_after: number
          rating_before: number
          reason: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          delta?: number
          game_id?: string | null
          id?: string
          idempotency_key?: string
          peak_after?: number
          peak_before?: number
          rating_after?: number
          rating_before?: number
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_rating_adjustments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_versions: {
        Row: {
          body: string
          changed_by: string | null
          created_at: string
          id: string
          key: string
          model: string
          prompt_id: string
          reason: string
          version: number
        }
        Insert: {
          body: string
          changed_by?: string | null
          created_at?: string
          id?: string
          key: string
          model: string
          prompt_id: string
          reason: string
          version: number
        }
        Update: {
          body?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          key?: string
          model?: string
          prompt_id?: string
          reason?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompts: {
        Row: {
          body: string
          created_at: string
          draft_body: string
          draft_updated_at: string | null
          has_draft: boolean
          id: string
          key: string
          model: string
          published_at: string
          reason: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body?: string
          created_at?: string
          draft_body?: string
          draft_updated_at?: string | null
          has_draft?: boolean
          id?: string
          key: string
          model?: string
          published_at?: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          draft_body?: string
          draft_updated_at?: string | null
          has_draft?: boolean
          id?: string
          key?: string
          model?: string
          published_at?: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      bot_sessions: {
        Row: {
          created_at: string
          current_fen: string
          end_reason: string | null
          engine_meta: Json
          finished_at: string | null
          id: string
          initial_fen: string
          last_activity_at: string
          last_idempotency_key: string | null
          last_snapshot: Json | null
          level: number
          moves: Json
          player_color: string
          profile_slug: string
          result: string | null
          status: string
          updated_at: string
          user_id: string
          variant: string
          version: number
        }
        Insert: {
          created_at?: string
          current_fen: string
          end_reason?: string | null
          engine_meta?: Json
          finished_at?: string | null
          id?: string
          initial_fen: string
          last_activity_at?: string
          last_idempotency_key?: string | null
          last_snapshot?: Json | null
          level: number
          moves?: Json
          player_color: string
          profile_slug: string
          result?: string | null
          status?: string
          updated_at?: string
          user_id: string
          variant?: string
          version?: number
        }
        Update: {
          created_at?: string
          current_fen?: string
          end_reason?: string | null
          engine_meta?: Json
          finished_at?: string | null
          id?: string
          initial_fen?: string
          last_activity_at?: string
          last_idempotency_key?: string | null
          last_snapshot?: Json | null
          level?: number
          moves?: Json
          player_color?: string
          profile_slug?: string
          result?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          variant?: string
          version?: number
        }
        Relationships: []
      }
      broadcast_sources: {
        Row: {
          consecutive_failures: number
          created_at: string
          event_id: string | null
          id: string
          kind: string
          last_attempt_at: string | null
          last_error: string | null
          last_success_at: string | null
          name: string
          poll_interval_seconds: number
          status: string
          token_hash: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          name: string
          poll_interval_seconds?: number
          status?: string
          token_hash?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          name?: string
          poll_interval_seconds?: number
          status?: string
          token_hash?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_sources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_live_events: {
        Row: {
          ai_styled: boolean
          coach_mode: string
          created_at: string
          id: string
          local_game_id: string
          loss_cp: number
          move_number: number
          personality: string
          ply_index: number
          retried: boolean
          severity: string
          skill_key: string
          trigger_kind: string
          user_id: string
        }
        Insert: {
          ai_styled?: boolean
          coach_mode: string
          created_at?: string
          id?: string
          local_game_id: string
          loss_cp?: number
          move_number: number
          personality: string
          ply_index: number
          retried?: boolean
          severity: string
          skill_key: string
          trigger_kind: string
          user_id: string
        }
        Update: {
          ai_styled?: boolean
          coach_mode?: string
          created_at?: string
          id?: string
          local_game_id?: string
          loss_cp?: number
          move_number?: number
          personality?: string
          ply_index?: number
          retried?: boolean
          severity?: string
          skill_key?: string
          trigger_kind?: string
          user_id?: string
        }
        Relationships: []
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
      engine_benchmarks: {
        Row: {
          config_signature: string | null
          created_at: string
          created_by: string | null
          depth: number | null
          engine_version: string
          hardware: Json
          id: string
          kind: string
          nodes: number | null
          nps: number | null
          passed: boolean
          profile_slug: string
          profile_version: number
          result: Json
          score: number | null
          signature: string | null
        }
        Insert: {
          config_signature?: string | null
          created_at?: string
          created_by?: string | null
          depth?: number | null
          engine_version: string
          hardware?: Json
          id?: string
          kind: string
          nodes?: number | null
          nps?: number | null
          passed?: boolean
          profile_slug: string
          profile_version: number
          result?: Json
          score?: number | null
          signature?: string | null
        }
        Update: {
          config_signature?: string | null
          created_at?: string
          created_by?: string | null
          depth?: number | null
          engine_version?: string
          hardware?: Json
          id?: string
          kind?: string
          nodes?: number | null
          nps?: number | null
          passed?: boolean
          profile_slug?: string
          profile_version?: number
          result?: Json
          score?: number | null
          signature?: string | null
        }
        Relationships: []
      }
      engine_move_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          latency_ms: number | null
          ply: number
          request: Json
          response: Json | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          latency_ms?: number | null
          ply: number
          request?: Json
          response?: Json | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          latency_ms?: number | null
          ply?: number
          request?: Json
          response?: Json | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_move_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_profile_versions: {
        Row: {
          benchmark_id: string | null
          changed_by: string | null
          config: Json
          created_at: string
          enabled: boolean
          id: string
          profile_id: string
          reason: string
          slug: string
          status: string
          stockfish_version: string
          version: number
        }
        Insert: {
          benchmark_id?: string | null
          changed_by?: string | null
          config: Json
          created_at?: string
          enabled: boolean
          id?: string
          profile_id: string
          reason: string
          slug: string
          status: string
          stockfish_version?: string
          version: number
        }
        Update: {
          benchmark_id?: string | null
          changed_by?: string | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          profile_id?: string
          reason?: string
          slug?: string
          status?: string
          stockfish_version?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "engine_profile_versions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "engine_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_profiles: {
        Row: {
          config: Json
          created_at: string
          draft_config: Json
          draft_updated_at: string | null
          enabled: boolean
          has_draft: boolean
          id: string
          is_public: boolean
          name: string
          published_at: string
          reason: string | null
          runtime: string
          slug: string
          status: string
          stockfish_version: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          config?: Json
          created_at?: string
          draft_config?: Json
          draft_updated_at?: string | null
          enabled?: boolean
          has_draft?: boolean
          id?: string
          is_public?: boolean
          name: string
          published_at?: string
          reason?: string | null
          runtime: string
          slug: string
          status?: string
          stockfish_version?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          config?: Json
          created_at?: string
          draft_config?: Json
          draft_updated_at?: string | null
          enabled?: boolean
          has_draft?: boolean
          id?: string
          is_public?: boolean
          name?: string
          published_at?: string
          reason?: string | null
          runtime?: string
          slug?: string
          status?: string
          stockfish_version?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      event_games: {
        Row: {
          black_clock_ms: number | null
          black_name: string
          black_player_id: string | null
          black_rating: number | null
          black_title: string | null
          board: number
          created_at: string
          current_fen: string
          eco: string | null
          eval_cp: number | null
          eval_mate: number | null
          event_id: string
          external_id: string
          id: string
          last_move_at: string | null
          moves: Json
          opening_name: string | null
          pgn: string | null
          ply_count: number
          result: string
          round_id: string | null
          source_id: string | null
          start_fen: string | null
          started_at: string | null
          status: string
          termination: string | null
          updated_at: string
          white_clock_ms: number | null
          white_name: string
          white_player_id: string | null
          white_rating: number | null
          white_title: string | null
        }
        Insert: {
          black_clock_ms?: number | null
          black_name?: string
          black_player_id?: string | null
          black_rating?: number | null
          black_title?: string | null
          board?: number
          created_at?: string
          current_fen?: string
          eco?: string | null
          eval_cp?: number | null
          eval_mate?: number | null
          event_id: string
          external_id: string
          id?: string
          last_move_at?: string | null
          moves?: Json
          opening_name?: string | null
          pgn?: string | null
          ply_count?: number
          result?: string
          round_id?: string | null
          source_id?: string | null
          start_fen?: string | null
          started_at?: string | null
          status?: string
          termination?: string | null
          updated_at?: string
          white_clock_ms?: number | null
          white_name?: string
          white_player_id?: string | null
          white_rating?: number | null
          white_title?: string | null
        }
        Update: {
          black_clock_ms?: number | null
          black_name?: string
          black_player_id?: string | null
          black_rating?: number | null
          black_title?: string | null
          board?: number
          created_at?: string
          current_fen?: string
          eco?: string | null
          eval_cp?: number | null
          eval_mate?: number | null
          event_id?: string
          external_id?: string
          id?: string
          last_move_at?: string | null
          moves?: Json
          opening_name?: string | null
          pgn?: string | null
          ply_count?: number
          result?: string
          round_id?: string | null
          source_id?: string | null
          start_fen?: string | null
          started_at?: string | null
          status?: string
          termination?: string | null
          updated_at?: string
          white_clock_ms?: number | null
          white_name?: string
          white_player_id?: string | null
          white_rating?: number | null
          white_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_games_black_player_id_fkey"
            columns: ["black_player_id"]
            isOneToOne: false
            referencedRelation: "event_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_games_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_games_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "event_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_games_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "broadcast_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_games_white_player_id_fkey"
            columns: ["white_player_id"]
            isOneToOne: false
            referencedRelation: "event_players"
            referencedColumns: ["id"]
          },
        ]
      }
      event_players: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          event_id: string
          federation: string | null
          fide_id: string | null
          id: string
          name: string
          rating: number | null
          slug: string
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          event_id: string
          federation?: string | null
          fide_id?: string | null
          id?: string
          name: string
          rating?: number | null
          slug: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          event_id?: string
          federation?: string | null
          fide_id?: string | null
          id?: string
          name?: string
          rating?: number | null
          slug?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_players_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rounds: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string | null
          number: number
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name?: string | null
          number: number
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string | null
          number?: number
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rounds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          featured: boolean
          id: string
          image_url: string | null
          is_published: boolean
          location: string | null
          name: string
          official_url: string | null
          rounds_total: number
          slug: string
          starts_at: string
          status: string
          time_zone: string
          tour: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          is_published?: boolean
          location?: string | null
          name: string
          official_url?: string | null
          rounds_total?: number
          slug: string
          starts_at: string
          status?: string
          time_zone?: string
          tour?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          is_published?: boolean
          location?: string | null
          name?: string
          official_url?: string | null
          rounds_total?: number
          slug?: string
          starts_at?: string
          status?: string
          time_zone?: string
          tour?: string | null
          updated_at?: string
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
      game_challenges: {
        Row: {
          allow_takeback: boolean
          color: string
          created_at: string
          creator_id: string
          expires_at: string
          game_id: string | null
          id: string
          message: string | null
          opponent_id: string | null
          pace: string
          rated: boolean
          rematch_of: string | null
          spectate: string
          spectator_delay_seconds: number
          status: string
          time_control: string
          updated_at: string
          variant: string
        }
        Insert: {
          allow_takeback?: boolean
          color?: string
          created_at?: string
          creator_id: string
          expires_at?: string
          game_id?: string | null
          id?: string
          message?: string | null
          opponent_id?: string | null
          pace?: string
          rated?: boolean
          rematch_of?: string | null
          spectate?: string
          spectator_delay_seconds?: number
          status?: string
          time_control: string
          updated_at?: string
          variant?: string
        }
        Update: {
          allow_takeback?: boolean
          color?: string
          created_at?: string
          creator_id?: string
          expires_at?: string
          game_id?: string | null
          id?: string
          message?: string | null
          opponent_id?: string | null
          pace?: string
          rated?: boolean
          rematch_of?: string | null
          spectate?: string
          spectator_delay_seconds?: number
          status?: string
          time_control?: string
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_challenges_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_challenges_rematch_of_fkey"
            columns: ["rematch_of"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_chat_messages: {
        Row: {
          author_name: string
          author_role: string
          body: string
          created_at: string
          game_id: string
          id: string
          ply: number
          user_id: string
        }
        Insert: {
          author_name?: string
          author_role?: string
          body: string
          created_at?: string
          game_id: string
          id?: string
          ply?: number
          user_id: string
        }
        Update: {
          author_name?: string
          author_role?: string
          body?: string
          created_at?: string
          game_id?: string
          id?: string
          ply?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_chat_messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
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
      game_takeback_requests: {
        Row: {
          created_at: string
          expires_at: string
          game_id: string
          game_version: number
          id: string
          idempotency_key: string
          plies: number
          requested_by: string
          requested_to: string
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
          plies: number
          requested_by: string
          requested_to: string
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
          plies?: number
          requested_by?: string
          requested_to?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_takeback_requests_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          allow_takeback: boolean
          black_id: string
          black_rating: number
          black_seen_at: string | null
          black_time_ms: number
          challenge_id: string | null
          clock_state: string
          created_at: string
          current_fen: string
          daily_move_ms: number
          deadline_at: string | null
          end_reason: string | null
          id: string
          increment_ms: number
          initial_fen: string
          last_move_at: string | null
          pace: string
          pool: string
          rated: boolean
          rating_applied_at: string | null
          rematch_of: string | null
          result: string
          spectate: string
          spectator_delay_seconds: number
          status: string
          takeback_count: number
          time_control: string
          tournament_id: string | null
          tournament_pairing_id: string | null
          turn_started_at: string | null
          updated_at: string
          variant: string
          version: number
          white_id: string
          white_rating: number
          white_seen_at: string | null
          white_time_ms: number
          winner_id: string | null
        }
        Insert: {
          allow_takeback?: boolean
          black_id: string
          black_rating: number
          black_seen_at?: string | null
          black_time_ms?: number
          challenge_id?: string | null
          clock_state?: string
          created_at?: string
          current_fen?: string
          daily_move_ms?: number
          deadline_at?: string | null
          end_reason?: string | null
          id?: string
          increment_ms?: number
          initial_fen?: string
          last_move_at?: string | null
          pace?: string
          pool?: string
          rated?: boolean
          rating_applied_at?: string | null
          rematch_of?: string | null
          result?: string
          spectate?: string
          spectator_delay_seconds?: number
          status?: string
          takeback_count?: number
          time_control?: string
          tournament_id?: string | null
          tournament_pairing_id?: string | null
          turn_started_at?: string | null
          updated_at?: string
          variant?: string
          version?: number
          white_id: string
          white_rating: number
          white_seen_at?: string | null
          white_time_ms?: number
          winner_id?: string | null
        }
        Update: {
          allow_takeback?: boolean
          black_id?: string
          black_rating?: number
          black_seen_at?: string | null
          black_time_ms?: number
          challenge_id?: string | null
          clock_state?: string
          created_at?: string
          current_fen?: string
          daily_move_ms?: number
          deadline_at?: string | null
          end_reason?: string | null
          id?: string
          increment_ms?: number
          initial_fen?: string
          last_move_at?: string | null
          pace?: string
          pool?: string
          rated?: boolean
          rating_applied_at?: string | null
          rematch_of?: string | null
          result?: string
          spectate?: string
          spectator_delay_seconds?: number
          status?: string
          takeback_count?: number
          time_control?: string
          tournament_id?: string | null
          tournament_pairing_id?: string | null
          turn_started_at?: string | null
          updated_at?: string
          variant?: string
          version?: number
          white_id?: string
          white_rating?: number
          white_seen_at?: string | null
          white_time_ms?: number
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_rematch_of_fkey"
            columns: ["rematch_of"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          created_at: string
          detail: Json | null
          duration_ms: number | null
          error: string | null
          id: string
          items_processed: number
          kind: string
          source_id: string | null
          source_name: string | null
          status: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          items_processed?: number
          kind: string
          source_id?: string | null
          source_name?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          items_processed?: number
          kind?: string
          source_id?: string | null
          source_name?: string | null
          status?: string
        }
        Relationships: []
      }
      learn_cards: {
        Row: {
          created_at: string
          difficulty: number
          due_at: string
          id: string
          lapses: number
          last_review: string | null
          lesson_id: string
          reps: number
          stability: number
          step_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number
          due_at?: string
          id?: string
          lapses?: number
          last_review?: string | null
          lesson_id: string
          reps?: number
          stability?: number
          step_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          due_at?: string
          id?: string
          lapses?: number
          last_review?: string | null
          lesson_id?: string
          reps?: number
          stability?: number
          step_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learn_cards_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "learn_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      learn_content_versions: {
        Row: {
          actor: string | null
          created_at: string
          doc: Json
          entity: string
          entity_id: string
          id: string
          note: string | null
          version: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          doc: Json
          entity: string
          entity_id: string
          id?: string
          note?: string | null
          version: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          doc?: Json
          entity?: string
          entity_id?: string
          id?: string
          note?: string | null
          version?: number
        }
        Relationships: []
      }
      learn_courses: {
        Row: {
          created_at: string
          created_by: string | null
          draft: Json
          id: string
          kind: string
          published: Json | null
          published_at: string | null
          slug: string
          sort_order: number
          status: string
          track: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft?: Json
          id?: string
          kind?: string
          published?: Json | null
          published_at?: string | null
          slug: string
          sort_order?: number
          status?: string
          track?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft?: Json
          id?: string
          kind?: string
          published?: Json | null
          published_at?: string | null
          slug?: string
          sort_order?: number
          status?: string
          track?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      learn_lessons: {
        Row: {
          chapter_id: string
          course_id: string
          created_at: string
          created_by: string | null
          draft: Json
          id: string
          published: Json | null
          published_at: string | null
          slug: string
          sort_order: number
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          chapter_id?: string
          course_id: string
          created_at?: string
          created_by?: string | null
          draft?: Json
          id?: string
          published?: Json | null
          published_at?: string | null
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          chapter_id?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          draft?: Json
          id?: string
          published?: Json | null
          published_at?: string | null
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "learn_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "learn_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      learn_progress: {
        Row: {
          attempts: number
          best_score: number
          completed_at: string | null
          created_at: string
          last_score: number
          last_studied_at: string
          lesson_id: string
          mastery: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          best_score?: number
          completed_at?: string | null
          created_at?: string
          last_score?: number
          last_studied_at?: string
          lesson_id: string
          mastery?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          best_score?: number
          completed_at?: string | null
          created_at?: string
          last_score?: number
          last_studied_at?: string
          lesson_id?: string
          mastery?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learn_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "learn_lessons"
            referencedColumns: ["id"]
          },
        ]
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
      news_articles: {
        Row: {
          author: string | null
          content_html: string | null
          created_at: string
          event_id: string | null
          external_guid: string | null
          external_url: string | null
          id: string
          image_url: string | null
          language: string
          published_at: string | null
          slug: string
          source_id: string | null
          source_name: string
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          content_html?: string | null
          created_at?: string
          event_id?: string | null
          external_guid?: string | null
          external_url?: string | null
          id?: string
          image_url?: string | null
          language?: string
          published_at?: string | null
          slug: string
          source_id?: string | null
          source_name?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          content_html?: string | null
          created_at?: string
          event_id?: string | null
          external_guid?: string | null
          external_url?: string | null
          id?: string
          image_url?: string | null
          language?: string
          published_at?: string | null
          slug?: string
          source_id?: string | null
          source_name?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_sources: {
        Row: {
          allowed_hosts: string[]
          consecutive_failures: number
          created_at: string
          enabled: boolean
          feed_url: string | null
          homepage_url: string | null
          id: string
          kind: string
          language: string
          last_error: string | null
          last_fetched_at: string | null
          last_success_at: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          allowed_hosts?: string[]
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          feed_url?: string | null
          homepage_url?: string | null
          id?: string
          kind?: string
          language?: string
          last_error?: string | null
          last_fetched_at?: string | null
          last_success_at?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          allowed_hosts?: string[]
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          feed_url?: string | null
          homepage_url?: string | null
          id?: string
          kind?: string
          language?: string
          last_error?: string | null
          last_fetched_at?: string | null
          last_success_at?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
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
      opening_datasets: {
        Row: {
          active: boolean
          attribution: string
          created_at: string
          eco_count: number
          id: string
          license: string
          name: string
          notes: string
          slug: string
          source_url: string
          updated_at: string
          updated_by: string | null
          version: string
        }
        Insert: {
          active?: boolean
          attribution?: string
          created_at?: string
          eco_count?: number
          id?: string
          license?: string
          name: string
          notes?: string
          slug: string
          source_url?: string
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Update: {
          active?: boolean
          attribution?: string
          created_at?: string
          eco_count?: number
          id?: string
          license?: string
          name?: string
          notes?: string
          slug?: string
          source_url?: string
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Relationships: []
      }
      opening_explorer_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fen: string
          fetched_at: string
          filters: Json
          hits: number
          latency_ms: number
          payload: Json
          source: string
        }
        Insert: {
          cache_key: string
          expires_at: string
          fen: string
          fetched_at?: string
          filters?: Json
          hits?: number
          latency_ms?: number
          payload: Json
          source: string
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fen?: string
          fetched_at?: string
          filters?: Json
          hits?: number
          latency_ms?: number
          payload?: Json
          source?: string
        }
        Relationships: []
      }
      opening_explorer_health: {
        Row: {
          breaker_trips: number
          consecutive_failures: number
          errors: number
          hits: number
          last_error: string | null
          misses: number
          open_until: string | null
          rate_limited: number
          requests: number
          source: string
          timeouts: number
          total_latency_ms: number
          updated_at: string
        }
        Insert: {
          breaker_trips?: number
          consecutive_failures?: number
          errors?: number
          hits?: number
          last_error?: string | null
          misses?: number
          open_until?: string | null
          rate_limited?: number
          requests?: number
          source: string
          timeouts?: number
          total_latency_ms?: number
          updated_at?: string
        }
        Update: {
          breaker_trips?: number
          consecutive_failures?: number
          errors?: number
          hits?: number
          last_error?: string | null
          misses?: number
          open_until?: string | null
          rate_limited?: number
          requests?: number
          source?: string
          timeouts?: number
          total_latency_ms?: number
          updated_at?: string
        }
        Relationships: []
      }
      opening_import_jobs: {
        Row: {
          created_at: string
          dataset_id: string | null
          failed: number
          id: string
          kind: string
          last_error: string | null
          params: Json
          processed: number
          requested_by: string | null
          result: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dataset_id?: string | null
          failed?: number
          id?: string
          kind?: string
          last_error?: string | null
          params?: Json
          processed?: number
          requested_by?: string | null
          result?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dataset_id?: string | null
          failed?: number
          id?: string
          kind?: string
          last_error?: string | null
          params?: Json
          processed?: number
          requested_by?: string | null
          result?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opening_import_jobs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "opening_datasets"
            referencedColumns: ["id"]
          },
        ]
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
          hints_used: number
          id: string
          mode: string
          moves_played: Json
          puzzle_id: string
          rating_after: number | null
          rating_before: number | null
          session_id: string | null
          solved: boolean
          source: string
          themes: string[]
          time_ms: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          grade: number
          hints_used?: number
          id?: string
          mode?: string
          moves_played?: Json
          puzzle_id: string
          rating_after?: number | null
          rating_before?: number | null
          session_id?: string | null
          solved?: boolean
          source?: string
          themes?: string[]
          time_ms?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          grade?: number
          hints_used?: number
          id?: string
          mode?: string
          moves_played?: Json
          puzzle_id?: string
          rating_after?: number | null
          rating_before?: number | null
          session_id?: string | null
          solved?: boolean
          source?: string
          themes?: string[]
          time_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "puzzle_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      puzzle_catalog: {
        Row: {
          attempts: number
          color: string
          created_at: string
          dataset_id: string | null
          enabled: boolean
          fen: string
          flag_reason: string | null
          flagged: boolean
          game_url: string | null
          id: string
          opening: string | null
          phase: string
          plies: number
          popularity: number
          rating: number
          rating_deviation: number
          solved: number
          source: string
          source_id: string | null
          themes: string[]
          updated_at: string
        }
        Insert: {
          attempts?: number
          color: string
          created_at?: string
          dataset_id?: string | null
          enabled?: boolean
          fen: string
          flag_reason?: string | null
          flagged?: boolean
          game_url?: string | null
          id: string
          opening?: string | null
          phase?: string
          plies?: number
          popularity?: number
          rating?: number
          rating_deviation?: number
          solved?: number
          source?: string
          source_id?: string | null
          themes?: string[]
          updated_at?: string
        }
        Update: {
          attempts?: number
          color?: string
          created_at?: string
          dataset_id?: string | null
          enabled?: boolean
          fen?: string
          flag_reason?: string | null
          flagged?: boolean
          game_url?: string | null
          id?: string
          opening?: string | null
          phase?: string
          plies?: number
          popularity?: number
          rating?: number
          rating_deviation?: number
          solved?: number
          source?: string
          source_id?: string | null
          themes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_catalog_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "puzzle_datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      puzzle_datasets: {
        Row: {
          attribution: string
          created_at: string
          id: string
          imported_count: number
          license: string
          license_url: string
          name: string
          notes: string
          slug: string
          source_url: string
          updated_at: string
          version: string
        }
        Insert: {
          attribution?: string
          created_at?: string
          id?: string
          imported_count?: number
          license: string
          license_url?: string
          name: string
          notes?: string
          slug: string
          source_url?: string
          updated_at?: string
          version?: string
        }
        Update: {
          attribution?: string
          created_at?: string
          id?: string
          imported_count?: number
          license?: string
          license_url?: string
          name?: string
          notes?: string
          slug?: string
          source_url?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      puzzle_lines: {
        Row: {
          created_at: string
          id: string
          kind: string
          line_index: number
          moves: Json
          ply_from: number
          puzzle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          line_index?: number
          moves?: Json
          ply_from?: number
          puzzle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          line_index?: number
          moves?: Json
          ply_from?: number
          puzzle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_lines_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzle_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      puzzle_ratings: {
        Row: {
          attempts: number
          peak_rating: number
          rating: number
          rating_deviation: number
          scope: string
          solved: number
          updated_at: string
          user_id: string
          volatility: number
        }
        Insert: {
          attempts?: number
          peak_rating?: number
          rating?: number
          rating_deviation?: number
          scope?: string
          solved?: number
          updated_at?: string
          user_id: string
          volatility?: number
        }
        Update: {
          attempts?: number
          peak_rating?: number
          rating?: number
          rating_deviation?: number
          scope?: string
          solved?: number
          updated_at?: string
          user_id?: string
          volatility?: number
        }
        Relationships: []
      }
      puzzle_sessions: {
        Row: {
          config: Json
          duration_seconds: number | null
          failed: number
          finished_at: string | null
          hints_used: number
          id: string
          lives: number | null
          mode: string
          score: number
          solved: number
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          duration_seconds?: number | null
          failed?: number
          finished_at?: string | null
          hints_used?: number
          id?: string
          lives?: number | null
          mode: string
          score?: number
          solved?: number
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          duration_seconds?: number | null
          failed?: number
          finished_at?: string | null
          hints_used?: number
          id?: string
          lives?: number | null
          mode?: string
          score?: number
          solved?: number
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      puzzle_themes: {
        Row: {
          category: string
          description_en: string
          description_vi: string
          enabled: boolean
          key: string
          name_en: string
          name_vi: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          description_en?: string
          description_vi?: string
          enabled?: boolean
          key: string
          name_en: string
          name_vi: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          description_en?: string
          description_vi?: string
          enabled?: boolean
          key?: string
          name_en?: string
          name_vi?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      puzzle_user_stats: {
        Row: {
          attempts: number
          best_streak: number
          current_streak: number
          hints_used: number
          last_solved_at: string | null
          solved: number
          sprint_best: number
          survival_best: number
          theme_stats: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          best_streak?: number
          current_streak?: number
          hints_used?: number
          last_solved_at?: string | null
          solved?: number
          sprint_best?: number
          survival_best?: number
          theme_stats?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          best_streak?: number
          current_streak?: number
          hints_used?: number
          last_solved_at?: string | null
          solved?: number
          sprint_best?: number
          survival_best?: number
          theme_stats?: Json
          updated_at?: string
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
      rate_limit_counters: {
        Row: {
          bucket_key: string
          count: number
          updated_at: string
          window_seconds: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          updated_at?: string
          window_seconds: number
          window_start?: string
        }
        Update: {
          bucket_key?: string
          count?: number
          updated_at?: string
          window_seconds?: number
          window_start?: string
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
          pool: string
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
          pool?: string
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
          pool?: string
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
      repertoire_cards: {
        Row: {
          color: string
          created_at: string
          difficulty: number
          due: string
          expected_san: string
          fen: string
          id: string
          lapses: number
          last_review: string | null
          move_id: string
          path: string
          repertoire_id: string
          reps: number
          stability: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          difficulty?: number
          due?: string
          expected_san: string
          fen: string
          id?: string
          lapses?: number
          last_review?: string | null
          move_id: string
          path: string
          repertoire_id: string
          reps?: number
          stability?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          difficulty?: number
          due?: string
          expected_san?: string
          fen?: string
          id?: string
          lapses?: number
          last_review?: string | null
          move_id?: string
          path?: string
          repertoire_id?: string
          reps?: number
          stability?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repertoire_cards_move_id_fkey"
            columns: ["move_id"]
            isOneToOne: false
            referencedRelation: "repertoire_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repertoire_cards_repertoire_id_fkey"
            columns: ["repertoire_id"]
            isOneToOne: false
            referencedRelation: "repertoires"
            referencedColumns: ["id"]
          },
        ]
      }
      repertoire_lines: {
        Row: {
          created_at: string
          eco: string | null
          id: string
          name: string
          notes: string
          opening_name: string | null
          repertoire_id: string
          root_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          eco?: string | null
          id?: string
          name?: string
          notes?: string
          opening_name?: string | null
          repertoire_id: string
          root_path?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          eco?: string | null
          id?: string
          name?: string
          notes?: string
          opening_name?: string | null
          repertoire_id?: string
          root_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repertoire_lines_repertoire_id_fkey"
            columns: ["repertoire_id"]
            isOneToOne: false
            referencedRelation: "repertoires"
            referencedColumns: ["id"]
          },
        ]
      }
      repertoire_moves: {
        Row: {
          created_at: string
          fen: string
          id: string
          is_own_move: boolean
          kind: string
          line_id: string
          notes: string
          parent_fen: string
          parent_path: string
          path: string
          ply: number
          repertoire_id: string
          san: string
          uci: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fen: string
          id?: string
          is_own_move?: boolean
          kind?: string
          line_id: string
          notes?: string
          parent_fen?: string
          parent_path?: string
          path: string
          ply: number
          repertoire_id: string
          san: string
          uci?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fen?: string
          id?: string
          is_own_move?: boolean
          kind?: string
          line_id?: string
          notes?: string
          parent_fen?: string
          parent_path?: string
          path?: string
          ply?: number
          repertoire_id?: string
          san?: string
          uci?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repertoire_moves_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "repertoire_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repertoire_moves_repertoire_id_fkey"
            columns: ["repertoire_id"]
            isOneToOne: false
            referencedRelation: "repertoires"
            referencedColumns: ["id"]
          },
        ]
      }
      repertoires: {
        Row: {
          color: string
          created_at: string
          description: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          description?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      skill_definitions: {
        Row: {
          category: string
          created_at: string
          description_en: string
          description_vi: string
          enabled: boolean
          key: string
          mastery_xp: number
          name_en: string
          name_vi: string
          sort_order: number
          thresholds: Json
          updated_at: string
          updated_by: string | null
          xp_per_event: number
        }
        Insert: {
          category: string
          created_at?: string
          description_en?: string
          description_vi?: string
          enabled?: boolean
          key: string
          mastery_xp?: number
          name_en: string
          name_vi: string
          sort_order?: number
          thresholds?: Json
          updated_at?: string
          updated_by?: string | null
          xp_per_event?: number
        }
        Update: {
          category?: string
          created_at?: string
          description_en?: string
          description_vi?: string
          enabled?: boolean
          key?: string
          mastery_xp?: number
          name_en?: string
          name_vi?: string
          sort_order?: number
          thresholds?: Json
          updated_at?: string
          updated_by?: string | null
          xp_per_event?: number
        }
        Relationships: []
      }
      skill_events: {
        Row: {
          created_at: string
          detail: Json
          event_key: string
          game_id: string | null
          id: string
          outcome: string
          ply: number | null
          skill_key: string
          source: string
          user_id: string
          xp_delta: number
        }
        Insert: {
          created_at?: string
          detail?: Json
          event_key: string
          game_id?: string | null
          id?: string
          outcome: string
          ply?: number | null
          skill_key: string
          source?: string
          user_id: string
          xp_delta?: number
        }
        Update: {
          created_at?: string
          detail?: Json
          event_key?: string
          game_id?: string | null
          id?: string
          outcome?: string
          ply?: number | null
          skill_key?: string
          source?: string
          user_id?: string
          xp_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "skill_events_skill_key_fkey"
            columns: ["skill_key"]
            isOneToOne: false
            referencedRelation: "skill_definitions"
            referencedColumns: ["key"]
          },
        ]
      }
      srs_cards: {
        Row: {
          created_at: string
          difficulty: number
          due: string
          id: string
          lapses: number
          last_review: string | null
          puzzle_id: string
          reps: number
          source: string
          stability: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number
          due?: string
          id?: string
          lapses?: number
          last_review?: string | null
          puzzle_id: string
          reps?: number
          source?: string
          stability?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          due?: string
          id?: string
          lapses?: number
          last_review?: string | null
          puzzle_id?: string
          reps?: number
          source?: string
          stability?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      studies: {
        Row: {
          black: string | null
          content: Json
          created_at: string
          description: string | null
          engine_allowed: boolean
          id: string
          mode: string
          owner_id: string
          preview_fen: string
          result: string | null
          revoked: boolean
          slug: string
          title: string
          updated_at: string
          view_count: number
          visibility: string
          white: string | null
        }
        Insert: {
          black?: string | null
          content?: Json
          created_at?: string
          description?: string | null
          engine_allowed?: boolean
          id?: string
          mode?: string
          owner_id: string
          preview_fen?: string
          result?: string | null
          revoked?: boolean
          slug: string
          title: string
          updated_at?: string
          view_count?: number
          visibility?: string
          white?: string | null
        }
        Update: {
          black?: string | null
          content?: Json
          created_at?: string
          description?: string | null
          engine_allowed?: boolean
          id?: string
          mode?: string
          owner_id?: string
          preview_fen?: string
          result?: string | null
          revoked?: boolean
          slug?: string
          title?: string
          updated_at?: string
          view_count?: number
          visibility?: string
          white?: string | null
        }
        Relationships: []
      }
      system_incidents: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      system_setting_versions: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          key: string
          previous_value: Json | null
          reason: string
          rollback_of: number | null
          value: Json
          version: number
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          key: string
          previous_value?: Json | null
          reason: string
          rollback_of?: number | null
          value: Json
          version: number
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          key?: string
          previous_value?: Json | null
          reason?: string
          rollback_of?: number | null
          value?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_setting_versions_key_fkey"
            columns: ["key"]
            isOneToOne: false
            referencedRelation: "system_settings"
            referencedColumns: ["key"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          draft_updated_at: string | null
          draft_value: Json | null
          has_draft: boolean
          key: string
          published_at: string
          reason: string | null
          scope: string
          updated_by: string | null
          value: Json
          version: number
        }
        Insert: {
          created_at?: string
          draft_updated_at?: string | null
          draft_value?: Json | null
          has_draft?: boolean
          key: string
          published_at?: string
          reason?: string | null
          scope: string
          updated_by?: string | null
          value: Json
          version?: number
        }
        Update: {
          created_at?: string
          draft_updated_at?: string | null
          draft_value?: Json | null
          has_draft?: boolean
          key?: string
          published_at?: string
          reason?: string | null
          scope?: string
          updated_by?: string | null
          value?: Json
          version?: number
        }
        Relationships: []
      }
      titan_move_charges: {
        Row: {
          created_at: string
          day: string
          id: string
          idempotency_key: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          idempotency_key: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          idempotency_key?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      titan_usage_daily: {
        Row: {
          day: string
          engine_ms: number
          moves: number
          updated_at: string
          user_id: string
        }
        Insert: {
          day: string
          engine_ms?: number
          moves?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          day?: string
          engine_ms?: number
          moves?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tournament_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          payload: Json
          tournament_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          tournament_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          tournament_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          run_at: string
          status: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          run_at?: string
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          run_at?: string
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_jobs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_pairings: {
        Row: {
          black_id: string | null
          black_points: number
          board: number
          bracket_slot: number | null
          created_at: string
          game_id: string | null
          id: string
          result: string | null
          round_id: string | null
          round_number: number
          scored: boolean
          status: string
          tournament_id: string
          updated_at: string
          white_id: string | null
          white_points: number
        }
        Insert: {
          black_id?: string | null
          black_points?: number
          board: number
          bracket_slot?: number | null
          created_at?: string
          game_id?: string | null
          id?: string
          result?: string | null
          round_id?: string | null
          round_number?: number
          scored?: boolean
          status?: string
          tournament_id: string
          updated_at?: string
          white_id?: string | null
          white_points?: number
        }
        Update: {
          black_id?: string | null
          black_points?: number
          board?: number
          bracket_slot?: number | null
          created_at?: string
          game_id?: string | null
          id?: string
          result?: string | null
          round_id?: string | null
          round_number?: number
          scored?: boolean
          status?: string
          tournament_id?: string
          updated_at?: string
          white_id?: string | null
          white_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_pairings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_pairings_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "tournament_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_pairings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_players: {
        Row: {
          byes: number
          colour_balance: number
          draws: number
          eliminated_round: number | null
          games_played: number
          id: string
          joined_at: string
          losses: number
          rank: number | null
          rating_at_join: number
          score: number
          seed: number | null
          status: string
          streak: number
          tiebreak: Json
          tournament_id: string
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          byes?: number
          colour_balance?: number
          draws?: number
          eliminated_round?: number | null
          games_played?: number
          id?: string
          joined_at?: string
          losses?: number
          rank?: number | null
          rating_at_join?: number
          score?: number
          seed?: number | null
          status?: string
          streak?: number
          tiebreak?: Json
          tournament_id: string
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          byes?: number
          colour_balance?: number
          draws?: number
          eliminated_round?: number | null
          games_played?: number
          id?: string
          joined_at?: string
          losses?: number
          rank?: number | null
          rating_at_join?: number
          score?: number
          seed?: number | null
          status?: string
          streak?: number
          tiebreak?: Json
          tournament_id?: string
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_rounds: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          number: number
          started_at: string
          status: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          number: number
          started_at?: string
          status?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          number?: number
          started_at?: string
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_rounds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_scores: {
        Row: {
          base_points: number
          bonus_points: number
          created_at: string
          id: string
          outcome: string
          pairing_id: string
          points: number
          reason: string | null
          round_number: number
          tournament_id: string
          user_id: string
        }
        Insert: {
          base_points?: number
          bonus_points?: number
          created_at?: string
          id?: string
          outcome: string
          pairing_id: string
          points?: number
          reason?: string | null
          round_number?: number
          tournament_id: string
          user_id: string
        }
        Update: {
          base_points?: number
          bonus_points?: number
          created_at?: string
          id?: string
          outcome?: string
          pairing_id?: string
          points?: number
          reason?: string | null
          round_number?: number
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_scores_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: false
            referencedRelation: "tournament_pairings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_scores_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          created_by: string | null
          current_round: number
          daily_recurrence: string | null
          description: string | null
          duration_minutes: number
          ends_at: string | null
          format: string
          id: string
          is_daily: boolean
          late_join: boolean
          max_players: number | null
          max_rating: number | null
          min_rating: number | null
          name: string
          paused: boolean
          rated: boolean
          registration_opens_at: string | null
          rounds_total: number
          scheduler_lease_until: string | null
          scheduler_owner: string | null
          scoring: Json
          settings: Json
          slug: string
          starts_at: string
          status: string
          tiebreaks: string[]
          time_control: string
          updated_at: string
          variant: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_round?: number
          daily_recurrence?: string | null
          description?: string | null
          duration_minutes?: number
          ends_at?: string | null
          format: string
          id?: string
          is_daily?: boolean
          late_join?: boolean
          max_players?: number | null
          max_rating?: number | null
          min_rating?: number | null
          name: string
          paused?: boolean
          rated?: boolean
          registration_opens_at?: string | null
          rounds_total?: number
          scheduler_lease_until?: string | null
          scheduler_owner?: string | null
          scoring?: Json
          settings?: Json
          slug: string
          starts_at?: string
          status?: string
          tiebreaks?: string[]
          time_control?: string
          updated_at?: string
          variant?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_round?: number
          daily_recurrence?: string | null
          description?: string | null
          duration_minutes?: number
          ends_at?: string | null
          format?: string
          id?: string
          is_daily?: boolean
          late_join?: boolean
          max_players?: number | null
          max_rating?: number | null
          min_rating?: number | null
          name?: string
          paused?: boolean
          rated?: boolean
          registration_opens_at?: string | null
          rounds_total?: number
          scheduler_lease_until?: string | null
          scheduler_owner?: string | null
          scoring?: Json
          settings?: Json
          slug?: string
          starts_at?: string
          status?: string
          tiebreaks?: string[]
          time_control?: string
          updated_at?: string
          variant?: string
          visibility?: string
        }
        Relationships: []
      }
      training_cards: {
        Row: {
          created_at: string
          fen: string
          id: string
          label: string
          ply: number | null
          skill_key: string | null
          solution: Json
          source_game_id: string | null
          srs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fen: string
          id?: string
          label?: string
          ply?: number | null
          skill_key?: string | null
          solution?: Json
          source_game_id?: string | null
          srs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fen?: string
          id?: string
          label?: string
          ply?: number | null
          skill_key?: string | null
          solution?: Json
          source_game_id?: string | null
          srs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_cards_skill_key_fkey"
            columns: ["skill_key"]
            isOneToOne: false
            referencedRelation: "skill_definitions"
            referencedColumns: ["key"]
          },
        ]
      }
      training_sessions: {
        Row: {
          budget_minutes: number
          completed_blocks: number
          created_at: string
          day: string
          failed_blocks: number
          id: string
          minutes_spent: number
          plan: Json
          results: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_minutes?: number
          completed_blocks?: number
          created_at?: string
          day: string
          failed_blocks?: number
          id?: string
          minutes_spent?: number
          plan?: Json
          results?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_minutes?: number
          completed_blocks?: number
          created_at?: string
          day?: string
          failed_blocks?: number
          id?: string
          minutes_spent?: number
          plan?: Json
          results?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_admin_state: {
        Row: {
          created_at: string
          created_by: string | null
          internal_note: string | null
          reason: string | null
          status: string
          suspended_until: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          internal_note?: string | null
          reason?: string | null
          status?: string
          suspended_until?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          internal_note?: string | null
          reason?: string | null
          status?: string
          suspended_until?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          version?: number
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
      user_skill_progress: {
        Row: {
          created_at: string
          last_event_at: string | null
          level: number
          negative_events: number
          positive_events: number
          skill_key: string
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          created_at?: string
          last_event_at?: string | null
          level?: number
          negative_events?: number
          positive_events?: number
          skill_key: string
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          created_at?: string
          last_event_at?: string | null
          level?: number
          negative_events?: number
          positive_events?: number
          skill_key?: string
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_skill_progress_skill_key_fkey"
            columns: ["skill_key"]
            isOneToOne: false
            referencedRelation: "skill_definitions"
            referencedColumns: ["key"]
          },
        ]
      }
      user_variant_ratings: {
        Row: {
          created_at: string
          draws: number
          games_played: number
          id: string
          last_rated_at: string | null
          losses: number
          peak_rating: number
          pool: string
          rating: number
          rating_deviation: number
          updated_at: string
          user_id: string
          volatility: number
          wins: number
        }
        Insert: {
          created_at?: string
          draws?: number
          games_played?: number
          id?: string
          last_rated_at?: string | null
          losses?: number
          peak_rating?: number
          pool: string
          rating?: number
          rating_deviation?: number
          updated_at?: string
          user_id: string
          volatility?: number
          wins?: number
        }
        Update: {
          created_at?: string
          draws?: number
          games_played?: number
          id?: string
          last_rated_at?: string | null
          losses?: number
          peak_rating?: number
          pool?: string
          rating?: number
          rating_deviation?: number
          updated_at?: string
          user_id?: string
          volatility?: number
          wins?: number
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
      admin_apply_rating_adjustment: {
        Args: {
          _actor: string
          _game_id?: string
          _idempotency_key: string
          _reason: string
          _target_rating: number
          _user_id: string
        }
        Returns: Json
      }
      admin_publish_setting: {
        Args: {
          _actor: string
          _expected_version?: number
          _key: string
          _reason: string
          _rollback_of?: number
          _scope: string
          _value: Json
        }
        Returns: Json
      }
      admin_save_setting_draft: {
        Args: {
          _actor: string
          _draft: Json
          _expected_version?: number
          _key: string
          _scope: string
        }
        Returns: Json
      }
      admin_set_user_state: {
        Args: {
          _actor: string
          _expected_version?: number
          _internal_note?: string
          _reason: string
          _status: string
          _suspended_until?: string
          _user_id: string
        }
        Returns: Json
      }
      admin_upsert_skill_definition: {
        Args: {
          _category: string
          _description_en: string
          _description_vi: string
          _enabled: boolean
          _key: string
          _mastery_xp: number
          _name_en: string
          _name_vi: string
          _sort_order: number
          _thresholds: Json
          _xp_per_event: number
        }
        Returns: {
          category: string
          created_at: string
          description_en: string
          description_vi: string
          enabled: boolean
          key: string
          mastery_xp: number
          name_en: string
          name_vi: string
          sort_order: number
          thresholds: Json
          updated_at: string
          updated_by: string | null
          xp_per_event: number
        }
        SetofOptions: {
          from: "*"
          to: "skill_definitions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ai_prompt_publish: {
        Args: {
          _actor: string
          _body: string
          _expected_version: number
          _key: string
          _model: string
          _reason: string
        }
        Returns: Json
      }
      apply_glicko2: { Args: { _game_id: string }; Returns: undefined }
      apply_rating_once: { Args: { _game_id: string }; Returns: Json }
      bot_session_commit: {
        Args: {
          _current_fen: string
          _end_reason: string
          _engine_meta: Json
          _expected_version: number
          _idempotency_key: string
          _moves: Json
          _result: string
          _session_id: string
          _status: string
          _user_id: string
        }
        Returns: Json
      }
      bump_study_view: { Args: { _slug: string }; Returns: undefined }
      challenge_create: {
        Args: {
          _allow_takeback: boolean
          _color: string
          _message: string
          _opponent_id: string
          _rated: boolean
          _rematch_of: string
          _spectate: string
          _spectator_delay: number
          _time_control: string
          _user_id: string
          _variant: string
        }
        Returns: Json
      }
      challenge_respond: {
        Args: {
          _action: string
          _challenge_id: string
          _initial_fen: string
          _user_id: string
        }
        Returns: Json
      }
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
      consume_rate_limit: {
        Args: {
          _cost?: number
          _key: string
          _limit: number
          _window_seconds: number
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
      engine_profile_publish: {
        Args: {
          _actor: string
          _benchmark_id?: string
          _config: Json
          _enabled: boolean
          _expected_version: number
          _reason: string
          _slug: string
          _status: string
          _stockfish_version?: string
        }
        Returns: Json
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
      ensure_pool_rating: {
        Args: { _pool: string; _user_id: string }
        Returns: {
          created_at: string
          draws: number
          games_played: number
          id: string
          last_rated_at: string | null
          losses: number
          peak_rating: number
          pool: string
          rating: number
          rating_deviation: number
          updated_at: string
          user_id: string
          volatility: number
          wins: number
        }
        SetofOptions: {
          from: "*"
          to: "user_variant_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_variant_rating: {
        Args: { _pool: string; _user_id: string }
        Returns: {
          created_at: string
          draws: number
          games_played: number
          id: string
          last_rated_at: string | null
          losses: number
          peak_rating: number
          pool: string
          rating: number
          rating_deviation: number
          updated_at: string
          user_id: string
          volatility: number
          wins: number
        }
        SetofOptions: {
          from: "*"
          to: "user_variant_ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_bot_sessions: { Args: { _idle_minutes?: number }; Returns: number }
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
      game_spectator_view: {
        Args: { _game_id: string; _viewer: string }
        Returns: Json
      }
      game_touch_presence: {
        Args: { _game_id: string; _user_id: string }
        Returns: Json
      }
      get_study_by_slug: { Args: { _slug: string }; Returns: Json }
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
      is_valid_chess960_start: { Args: { _fen: string }; Returns: boolean }
      list_public_games: { Args: { _limit?: number }; Returns: Json }
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
      opening_explorer_record: {
        Args: {
          _error?: string
          _failure_threshold?: number
          _latency_ms?: number
          _open_seconds?: number
          _outcome: string
          _source: string
        }
        Returns: Json
      }
      process_notification_outbox: { Args: { _limit?: number }; Returns: Json }
      purge_rate_limit_counters: {
        Args: { _older_than_hours?: number }
        Returns: number
      }
      puzzle_catalog_record_attempt: {
        Args: { _puzzle_id: string; _solved: boolean }
        Returns: undefined
      }
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
      rating_pool: { Args: { _tc: string; _variant: string }; Returns: string }
      record_skill_events: { Args: { _events: Json }; Returns: Json }
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
      sync_game_state: {
        Args: { _game_id: string; _since_move?: number }
        Returns: Json
      }
      takeback_request_internal: {
        Args: {
          _expected_version: number
          _game_id: string
          _idempotency_key: string
          _user_id: string
        }
        Returns: Json
      }
      takeback_respond_internal: {
        Args: {
          _action: string
          _game_id: string
          _request_id: string
          _user_id: string
        }
        Returns: Json
      }
      tc_increment_ms: { Args: { _time_control: string }; Returns: number }
      tc_spec: { Args: { _tc: string }; Returns: Json }
      titan_consume_move: {
        Args: {
          _idempotency_key: string
          _limit: number
          _session_id: string
          _user_id: string
        }
        Returns: Json
      }
      titan_record_engine_ms: {
        Args: { _ms: number; _user_id: string }
        Returns: undefined
      }
      tournament_acquire_lease: {
        Args: { _owner: string; _tournament_id: string; _ttl_seconds?: number }
        Returns: boolean
      }
      tournament_apply_pairings: {
        Args: { _pairings: Json; _round_number: number; _tournament_id: string }
        Returns: Json
      }
      tournament_claim_jobs: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          run_at: string
          status: string
          tournament_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tournament_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tournament_complete_job: {
        Args: { _error?: string; _job_id: string; _ok: boolean }
        Returns: undefined
      }
      tournament_enqueue_job: {
        Args: {
          _dedupe_key: string
          _kind: string
          _run_at?: string
          _tournament_id: string
        }
        Returns: string
      }
      tournament_invalidate_pairing: {
        Args: { _pairing_id: string; _reason: string }
        Returns: Json
      }
      tournament_join: { Args: { _tournament_id: string }; Returns: Json }
      tournament_open_round: {
        Args: { _number: number; _tournament_id: string }
        Returns: Json
      }
      tournament_record_pairing_result: {
        Args: { _pairing_id: string; _result: string; _rows: Json }
        Returns: Json
      }
      tournament_release_lease: {
        Args: { _owner: string; _tournament_id: string }
        Returns: undefined
      }
      tournament_set_standings: {
        Args: { _rows: Json; _tournament_id: string }
        Returns: Json
      }
      tournament_start_pairing_game: {
        Args: { _initial_fen: string; _pairing_id: string }
        Returns: Json
      }
      tournament_withdraw: { Args: { _tournament_id: string }; Returns: Json }
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
