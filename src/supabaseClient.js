import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gfwfmaiapnatggsbqdqf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdmd2ZtYWlhcG5hdGdnc2JxZHFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODk3MzYsImV4cCI6MjA5MTA2NTczNn0.pTfJb9dypvH3OSr6qyRlzYmOyhdbF96NUIk_Usp-peU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
