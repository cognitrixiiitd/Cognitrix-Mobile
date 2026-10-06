export type Role = 'admin' | 'professor' | 'student';

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  avatar_url?: string | null;
  email?: string | null;
  account_status?: string | null;
};

export type Course = {
  id: string;
  title: string;
  short_description?: string | null;
  long_description?: string | null;
  category?: string | null;
  difficulty_level?: string | null;
  tags?: string[] | null;
  professor_id?: string;
  professor_name?: string | null;
  instructor_rating?: number | null;
  status?: 'draft' | 'published' | 'archived';
  learning_outcomes?: string[] | null;
  prerequisites?: string[] | null;
  estimated_hours?: number | null;
  credits?: number | null;
  thumbnail_url?: string | null;
  enrollment_count?: number | null;
  created_at?: string;
};

export type TopicTimestamp = { start_seconds?: number; label?: string; topic?: string };
export type Resource = { title?: string; url: string; description?: string };
export type Attachment = { name?: string; url: string };

export type Lecture = {
  id: string;
  course_id?: string;
  title: string;
  type: 'video' | 'youtube' | 'pdf' | 'slides' | 'notes' | 'external_link';
  source_url?: string | null;
  order_index?: number | null;
  duration_minutes?: number | null;
  transcript_text?: string | null;
  ai_generated_description?: string | null;
  suggested_resources?: Resource[] | null;
  topic_timestamps?: TopicTimestamp[] | null;
  attachments?: Attachment[] | null;
  section_name?: string | null;
  allow_download?: boolean | null;
  /** Downloadable copy of a YouTube lecture (added by mobile_offline_sync.sql). */
  offline_video_url?: string | null;
};

export type Enrollment = {
  id: string;
  student_id: string;
  course_id: string;
  status: 'active' | 'completed' | 'dropped';
  progress_percent: number | null;
  completed_lectures: string[] | null;
  time_spent_minutes: number | null;
  last_accessed?: string | null;
  completed_at?: string | null;
  quiz_scores?: QuizScore[] | null;
};

export type QuizScore = { quiz_id: string; score: number; max_score: number; submitted_at: string };

export type QuizQuestion = {
  id: string;
  quiz_id: string;
  question_type: 'multiple_choice' | 'fill_in_blank' | 'short_answer' | null;
  question_text: string;
  choices: string[] | null;
  correct_index: number | null;
  correct_answer: string | null;
  topic?: string | null;
  order_index?: number | null;
};

export type Quiz = {
  id: string;
  course_id: string;
  lecture_id: string | null;
  title: string;
  total_points: number | null;
  questions: QuizQuestion[];
};

export type Achievement = {
  id: string;
  achievement_type: string;
  badge_name: string;
  badge_description?: string | null;
  badge_icon?: string | null;
  points_awarded?: number | null;
  created_at?: string;
};

export type Bookmark = {
  id: string;
  course_id: string;
  lecture_id: string;
  timestamp_seconds: number | null;
  note: string | null;
  created_at?: string;
};

export type Answer = { id: string; text: string; user_name: string | null; created_at: string };

export type Question = {
  id: string;
  text: string;
  user_name?: string | null;
  status: 'open' | 'answered' | 'closed';
  course_id?: string;
  is_stuck_flag?: boolean;
  created_at: string;
  answers: Answer[];
  course_title?: string;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string | null;
  data: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
};
