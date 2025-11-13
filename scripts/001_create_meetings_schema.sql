-- Create users profile table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create meetings table
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_code TEXT UNIQUE NOT NULL,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  max_participants INT DEFAULT 100
);

-- Create meeting participants table
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  UNIQUE(meeting_id, user_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Meetings policies
CREATE POLICY "meetings_select_all" ON public.meetings FOR SELECT USING (TRUE);
CREATE POLICY "meetings_insert_own" ON public.meetings FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "meetings_update_own" ON public.meetings FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "meetings_delete_own" ON public.meetings FOR DELETE USING (auth.uid() = creator_id);

-- Meeting participants policies
CREATE POLICY "participants_select_all" ON public.meeting_participants FOR SELECT USING (TRUE);
CREATE POLICY "participants_insert_any" ON public.meeting_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "participants_update_own" ON public.meeting_participants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "participants_delete_own" ON public.meeting_participants FOR DELETE USING (auth.uid() = user_id);
