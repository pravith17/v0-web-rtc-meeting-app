import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { WebRTCRoom } from "@/components/webrtc-room"

interface MeetingPageProps {
  params: Promise<{ code: string }>
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { code } = await params
  const supabase = await createClient()

  // Get current user
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase.from("profiles").select("username").eq("id", data.user.id).maybeSingle() // Use maybeSingle instead of single to handle 0 rows

  const username = profile?.username || data.user.email?.split("@")[0] || "User"

  // Verify meeting exists
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, is_active")
    .eq("meeting_code", code.toUpperCase())
    .single()

  if (meetingError || !meeting) {
    redirect("/home")
  }

  if (!meeting.is_active) {
    redirect("/home")
  }

  return <WebRTCRoom meetingCode={code} username={username} />
}
