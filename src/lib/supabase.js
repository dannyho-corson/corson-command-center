import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://smueknsapnvyrdfnnkkq.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdWVrbnNhcG52eXJkZm5ua2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQxNzQsImV4cCI6MjA5MTA5MDE3NH0.ycYKQtF5JTb1bcDuRdFk-PrwNl15qf0f39ac2GzUWLc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
