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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
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
      fairplay_reports: {
        Row: {
          action: string
          confidence: number
          contributions: Json
          created_at: string
          features: Json
          game_id: string
          id: string
          model: string
          probability: number
          reasons: Json
          score: number
          user_id: string
        }
        Insert: {
          action?: string
          confidence?: number
          contributions?: Json
          created_at?: string
          features?: Json
          game_id: string
          id?: string
          model?: string
          probability?: number
          reasons?: Json
          score?: number
          user_id: string
        }
        Update: {
          action?: string
          confidence?: number
          contributions?: Json
          created_at?: string
          features?: Json
          game_id?: string
          id?: string
          model?: string
          probability?: number
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
          rating_locked: boolean
          reasons: Json
          sandbagging_score: number
          score: number
          sprt_decision: string
          sprt_llr: number
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: string
          boosting_score?: number
          games_reviewed?: number
          rating_locked?: boolean
          reasons?: Json
          sandbagging_score?: number
          score?: number
          sprt_decision?: string
          sprt_llr?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          boosting_score?: number
          games_reviewed?: number
          rating_locked?: boolean
          reasons?: Json
          sandbagging_score?: number
          score?: number
          sprt_decision?: string
          sprt_llr?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          created_at: string
          current_fen: string
          end_reason: string | null
          id: string
          initial_fen: string
          last_move_at: string | null
          rated: boolean
          result: string
          status: string
          time_control: string
          updated_at: string
          variant: string
          white_id: string
          white_rating: number
          white_time_ms: number
          winner_id: string | null
        }
        Insert: {
          black_id: string
          black_rating: number
          black_time_ms?: number
          created_at?: string
          current_fen?: string
          end_reason?: string | null
          id?: string
          initial_fen?: string
          last_move_at?: string | null
          rated?: boolean
          result?: string
          status?: string
          time_control?: string
          updated_at?: string
          variant?: string
          white_id: string
          white_rating: number
          white_time_ms?: number
          winner_id?: string | null
        }
        Update: {
          black_id?: string
          black_rating?: number
          black_time_ms?: number
          created_at?: string
          current_fen?: string
          end_reason?: string | null
          id?: string
          initial_fen?: string
          last_move_at?: string | null
          rated?: boolean
          result?: string
          status?: string
          time_control?: string
          updated_at?: string
          variant?: string
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
          rating?: number
          status?: string
          time_control?: string
          updated_at?: string
          user_id?: string
          variant?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
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
      apply_glicko2: { Args: { _game_id: string }; Returns: undefined }
      commit_move: {
        Args: {
          _base_fen: string
          _black_time_ms: number
          _fen: string
          _game_id: string
          _san: string
          _uci: string
          _white_time_ms: number
        }
        Returns: Json
      }
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
