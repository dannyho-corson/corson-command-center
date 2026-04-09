import { supabase } from './supabase';

/**
 * Fire-and-forget activity log insert.
 * Call after any meaningful write — show added, deal added, stage changed.
 */
export function logActivity(artist_slug, action, description) {
  supabase
    .from('activity_log')
    .insert({ artist_slug, action, description })
    .then(() => {});
}
