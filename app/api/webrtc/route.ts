import { NextResponse } from "next/server"
import type { WebSocket } from "ws"
import Bun from "bun"

// Store active meetings and WebSocket connections
const meetings = new Map<
  string,
  Map<
    string,
    {
      userId: string
      username: string
      ws: WebSocket
    }
  >
>()

export async function GET(req: Request) {
  const url = new URL(req.url)
  const meetingCode = url.searchParams.get("meeting")
  const userId = url.searchParams.get("userId")
  const username = url.searchParams.get("username")

  if (!meetingCode || !userId || !username) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  // Handle WebSocket upgrade
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Bun.upgrade(req, {
      data: { meetingCode, userId, username },
    })

    // Initialize meeting if it doesn't exist
    if (!meetings.has(meetingCode)) {
      meetings.set(meetingCode, new Map())
    }

    const meetingParticipants = meetings.get(meetingCode)!
    const existingParticipants = Array.from(meetingParticipants.values()).map((p) => ({
      userId: p.userId,
      username: p.username,
    }))

    // Store this connection
    meetingParticipants.set(userId, { userId, username, ws: socket })

    // Send existing participants to new user
    socket.send(
      JSON.stringify({
        type: "join-response",
        participants: existingParticipants,
      }),
    )

    // Notify others of new user
    meetingParticipants.forEach((participant) => {
      if (participant.userId !== userId) {
        participant.ws.send(
          JSON.stringify({
            type: "user-joined",
            userId,
            username,
          }),
        )
      }
    })

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)

      if (message.type === "offer" || message.type === "answer" || message.type === "ice-candidate") {
        const targetParticipant = meetingParticipants.get(message.to)
        if (targetParticipant) {
          targetParticipant.ws.send(JSON.stringify(message))
        }
      }
    }

    socket.onclose = () => {
      meetingParticipants.delete(userId)

      // Notify others
      meetingParticipants.forEach((participant) => {
        participant.ws.send(
          JSON.stringify({
            type: "user-left",
            userId,
            username,
          }),
        )
      })

      // Clean up empty meetings
      if (meetingParticipants.size === 0) {
        meetings.delete(meetingCode)
      }
    }

    return response
  }

  return NextResponse.json({ error: "WebSocket required" }, { status: 400 })
}
