import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { MeetingActions } from "@/components/meeting-actions"
import { UserMenu } from "@/components/user-menu"
import { Video } from "lucide-react"

export default async function HomePage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase.from("profiles").select("username").eq("id", data.user.id).maybeSingle()

  // If profile doesn't exist, create one
  if (!profile) {
    const username = data.user.email?.split("@")[0] || `user_${data.user.id.slice(0, 8)}`
    await supabase.from("profiles").insert({
      id: data.user.id,
      username: username,
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <Video className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold">WebRTC Meetings</h1>
          </div>
          <UserMenu email={data.user.email || ""} />
        </div>

        {/* Main Content */}
        <div className="grid gap-8">
          <div className="bg-card rounded-lg border border-border p-8 shadow-lg">
            <div className="flex flex-col items-center text-center gap-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Welcome!</h2>
                <p className="text-muted-foreground">Start hosting or join an existing meeting</p>
              </div>
              <MeetingActions />
            </div>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="text-2xl mb-2">📹</div>
              <h3 className="font-semibold mb-2">HD Video</h3>
              <p className="text-sm text-muted-foreground">Crystal clear video with real-time WebRTC technology</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="text-2xl mb-2">🔊</div>
              <h3 className="font-semibold mb-2">Clear Audio</h3>
              <p className="text-sm text-muted-foreground">High quality audio with echo cancellation</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="text-2xl mb-2">🖥️</div>
              <h3 className="font-semibold mb-2">Screen Share</h3>
              <p className="text-sm text-muted-foreground">Share your screen with participants</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
