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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      game_rooms: {
        Row: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          countdown_started_at?: string | null
          dare_text?: string | null
          ended_at?: string | null
          host_id: string
          loser_id?: string | null
          loser_name?: string | null
          mode?: string
          players?: Json
          room_code: string
          round_started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          countdown_started_at?: string | null
          dare_text?: string | null
          ended_at?: string | null
          host_id?: string
          loser_id?: string | null
          loser_name?: string | null
          mode?: string
          players?: Json
          room_code?: string
          round_started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_game_if_ready: {
        Args: { p_room_code: string }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_game_room: {
        Args: {
          p_host_id: string
          p_host_name: string
          p_mode?: string
          p_room_code: string
        }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_game_room: {
        Args: { p_loser_id: string; p_loser_name: string; p_room_code: string }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_game_room: {
        Args: {
          p_display_name: string
          p_player_id: string
          p_room_code: string
        }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_game_room_motion_enabled: {
        Args: { p_player_id: string; p_room_code: string }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_game_room_player_ready: {
        Args: { p_is_ready: boolean; p_player_id: string; p_room_code: string }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_game_arming: {
        Args: { p_player_id: string; p_room_code: string }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_game_room_dare: {
        Args: { p_dare_text: string; p_player_id: string; p_room_code: string }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_game_room_mode: {
        Args: { p_mode: string; p_player_id: string; p_room_code: string }
        Returns: {
          countdown_started_at: string | null
          dare_text: string | null
          ended_at: string | null
          host_id: string
          loser_id: string | null
          loser_name: string | null
          mode: string
          players: Json
          room_code: string
          round_started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "game_rooms"
          isOneToOne: true
          isSetofReturn: false
        }
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
    Enums: {},
  },
} as const
