import { createClient } from '@supabase/supabase-js';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      problems: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          title: string;
          description: string;
          status: 'pending' | 'solved' | 'unsolved';
          keywords: string[];
          repository_contents: Json;
          user_id: string | null;
          problem_comments: Database['public']['Tables']['problem_comments']['Row'][];
        };
        Insert: Omit<Database['public']['Tables']['problems']['Row'], 'created_at' | 'updated_at' | 'problem_comments'>;
        Update: Partial<Database['public']['Tables']['problems']['Insert']>;
      };
      problem_comments: {
        Row: {
          id: string;
          created_at: string;
          problem_id: string;
          content: string;
          username: string;
        };
        Insert: Omit<Database['public']['Tables']['problem_comments']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['problem_comments']['Insert']>;
      };
    };
  };
}

let supabaseUrl: string;
let supabaseAnonKey: string;


// Check if we're in a Cloudflare environment
if (typeof process === 'undefined') {
  // Client-side or Cloudflare environment
  supabaseUrl = (window as any).ENV?.SUPABASE_URL ?? '';
  supabaseAnonKey = (window as any).ENV?.SUPABASE_ANON_KEY ?? '';
} else {
  // Node.js environment (development)
  supabaseUrl = process.env.SUPABASE_URL ?? '';
  supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey); 