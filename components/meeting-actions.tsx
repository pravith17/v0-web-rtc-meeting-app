"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Copy, Check } from "lucide-react"

function generateMeetingCode() {
  return Math.random().toString(36).substring(2, 12).toUpperCase()
}

export function MeetingActions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isJoinOpen, setIsJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [copiedToClipboard, setCopiedToClipboard] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleCreateMeeting = async () => {
    setError(null)
    setIsLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const meetingCode = generateMeetingCode()

      const { error: insertError } = await supabase.from("meetings").insert({
        meeting_code: meetingCode,
        creator_id: user.id,
      })

      if (insertError) throw insertError

      setCreatedCode(meetingCode)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create meeting")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyCode = async () => {
    if (createdCode) {
      try {
        await navigator.clipboard.writeText(createdCode)
        setCopiedToClipboard(true)
        setTimeout(() => setCopiedToClipboard(false), 2000)
      } catch (err) {
        console.error("Failed to copy:", err)
      }
    }
  }

  const handleStartMeeting = () => {
    if (createdCode) {
      setIsCreateOpen(false)
      router.push(`/meeting/${createdCode}`)
    }
  }

  const handleJoinMeeting = async () => {
    if (!joinCode.trim()) {
      setError("Please enter a meeting code")
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Check if meeting exists
      const { data: meeting, error: fetchError } = await supabase
        .from("meetings")
        .select("id, is_active")
        .eq("meeting_code", joinCode.toUpperCase())
        .single()

      if (fetchError || !meeting) {
        throw new Error("Meeting not found or has ended")
      }

      if (!meeting.is_active) {
        throw new Error("This meeting has ended")
      }

      setIsJoinOpen(false)
      router.push(`/meeting/${joinCode.toUpperCase()}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join meeting")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex gap-4">
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Meeting</DialogTitle>
            <DialogDescription>
              {createdCode ? "Share this code with participants" : "A unique meeting code will be generated for you"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {createdCode ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg border border-border">
                  <span className="flex-1 font-mono text-lg font-semibold text-center">{createdCode}</span>
                  <Button
                    onClick={handleCopyCode}
                    size="icon"
                    variant="ghost"
                    className="flex-shrink-0"
                    title="Copy meeting code"
                  >
                    {copiedToClipboard ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Share this code with others so they can join your meeting
                </p>
                <Button onClick={handleStartMeeting} className="w-full">
                  Start Meeting
                </Button>
              </div>
            ) : (
              <Button onClick={handleCreateMeeting} disabled={isLoading} className="w-full">
                {isLoading ? "Creating..." : "Create Meeting"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join Meeting</DialogTitle>
            <DialogDescription>Enter the meeting code to join</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="code">Meeting Code</Label>
              <Input
                id="code"
                placeholder="e.g., ABC123XYZ"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleJoinMeeting} disabled={isLoading} className="w-full">
              {isLoading ? "Joining..." : "Join Meeting"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Button onClick={() => setIsCreateOpen(true)} size="lg" className="px-8">
        Create Meeting
      </Button>
      <Button onClick={() => setIsJoinOpen(true)} size="lg" variant="outline" className="px-8">
        Join Meeting
      </Button>
    </div>
  )
}
