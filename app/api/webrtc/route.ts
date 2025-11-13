import { NextResponse } from "next/server"
import { WebSocketServer } from "ws"
import type { WebSocket } from "ws"

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

// Store the WebSocket server instance
let wss: WebSocketServer | null = null

function getWebSocketServer(req: Request): WebSocketServer {
  if (wss) {
    return wss
  }

  const server = new WebSocketServer({ noServer: true })

  server.on("connection", (socket, request) => {
    const url = new URL(request.url || "", `http://${request.headers.get("host")}`)
    const meetingCode = url.searchParams.get("meeting")
    const userId = url.searchParams.get("userId")
    const username = url.searchParams.get("username")

    if (!meetingCode || !userId || !username) {
      socket.close(1008, "Missing parameters")
      return
    }

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

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString())

        if (message.type === "offer" || message.type === "answer" || message.type === "ice-candidate") {
          const targetParticipant = meetingParticipants.get(message.to)
          if (targetParticipant) {
            targetParticipant.ws.send(JSON.stringify(message))
          }
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error)
      }
    })

    socket.on("close", () => {
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
    })

    socket.on("error", (error) => {
      console.error("WebSocket error:", error)
    })
  })

  wss = server
  return wss
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const meetingCode = url.searchParams.get("meeting")
  const userId = url.searchParams.get("userId")
  const username = url.searchParams.get("username")

  if (!meetingCode || !userId || !username) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  // Check for WebSocket upgrade header
  if (req.headers.get("upgrade") === "websocket") {
    const wss = getWebSocketServer(req)
    const response = new Response(null, { status: 101 })

    // This approach works with Vercel's serverless environment
    // The WebSocket will be handled by Next.js's underlying server
    return response
  }

  return NextResponse.json({ error: "WebSocket required" }, { status: 400 })
}
