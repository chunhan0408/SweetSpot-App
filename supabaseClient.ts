
import { createClient } from '@supabase/supabase-js';

// Using the Supabase credentials provided in the prompt.
// We prefer environment variables but fallback to the provided strings to ensure the app connects.
const supabaseUrl = process.env.SUPABASE_URL || 'https://dlpyowpiwxpfrcadepnn.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_k2xTVQhivSIpeywpansgCA_ThmmfORb';

if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
  console.warn("Supabase URL is missing or using placeholder. Please check your environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
