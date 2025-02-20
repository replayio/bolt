import { supabase, type Database } from './client';

export type Problem = Database['public']['Tables']['problems']['Row'];
export type ProblemComment = Database['public']['Tables']['problem_comments']['Row'];
export type ProblemStatus = Problem['status'];

export async function listAllProblems(): Promise<Problem[]> {
  const { data, error } = await supabase
    .from('problems')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching problems:', error);
    throw error;
  }

  return data;
}

export async function getProblem(id: string): Promise<Problem | null> {
  const { data, error } = await supabase
    .from('problems')
    .select(`
      *,
      problem_comments (
        *
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching problem:', error);
    throw error;
  }

  return data;
}

export async function createProblem(problem: Database['public']['Tables']['problems']['Insert']) {
  const { data, error } = await supabase
    .from('problems')
    .insert(problem)
    .select()
    .single();

  if (error) {
    console.error('Error creating problem:', error);
    throw error;
  }

  return data;
}

export async function updateProblem(id: string, updates: Database['public']['Tables']['problems']['Update']) {
  const { data, error } = await supabase
    .from('problems')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating problem:', error);
    throw error;
  }

  return data;
}

export async function addProblemComment(comment: Database['public']['Tables']['problem_comments']['Insert']) {
  const { data, error } = await supabase
    .from('problem_comments')
    .insert(comment)
    .select()
    .single();

  if (error) {
    console.error('Error adding comment:', error);
    throw error;
  }

  return data;
}

// Helper functions for managing user state
export function getProblemsUsername(): string {
  return localStorage.getItem('problems_username') || 'Anonymous';
}

export function setProblemsUsername(username: string) {
  localStorage.setItem('problems_username', username);
}

export function hasNutAdminKey(): boolean {
  return !!localStorage.getItem('nut_admin_key');
}

export function setNutAdminKey(key: string) {
  localStorage.setItem('nut_admin_key', key);
}

export function getNutAdminKey(): string | null {
  return localStorage.getItem('nut_admin_key');
} 