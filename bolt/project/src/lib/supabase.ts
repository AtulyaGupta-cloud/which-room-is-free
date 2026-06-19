import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bhcyditvjnhmpvvqcsfh.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoY3lkaXR2am5obXB2dnFjc2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTUwMzYsImV4cCI6MjA5NjM5MTAzNn0.K2ZtsnUrrj3SgQbZXi54gYGxsPpn5y4h2TN48t_crMM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Room {
  id: string;
  room_number: string;
  building: string;
  floor: string;
  venue: string;
  created_at: string;
}

export interface RoomSchedule {
  id: string;
  room_id: string;
  room_number: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  course_code: string;
}
