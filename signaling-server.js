const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const cors = require("cors")

const app = express()
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

app.use(cors())

// Store active meetings and their participants
const meetings = new Map()

// Utility to get meeting participants
function getMeetingParticipants(meetingCode) {
  if (!meetings.has(meetingCode)) {
    meetings.set(meetingCode, new Map())
  }
  return meetings.get(meetingCode)
}

io.on("connection", (socket) => {
  console.log(`[SOCKET] User connected: ${socket.id}`)

  // User joins a meeting
  socket.on("join-meeting", (data, callback) => {
    const { meetingCode, userId, username } = data
    console.log(`[MEETING] ${username} (${userId}) joining meeting ${meetingCode}`)

    socket.join(meetingCode)

    const participants = getMeetingParticipants(meetingCode)
    const existingParticipants = Array.from(participants.values())

    // Store this user
    participants.set(userId, {
      socketId: socket.id,
      userId,
      username,
    })

    // Send existing participants to the new user
    callback({
      success: true,
      participants: existingParticipants,
    })

    // Notify others that a new user joined
    socket.to(meetingCode).emit("user-joined", {
      userId,
      username,
    })

    console.log(`[MEETING] ${meetingCode} now has ${participants.size} participants`)
  })

  // Relay offer only to intended recipient using socket.io's to() with socket ID
  socket.on("offer", (data) => {
    const { meetingCode, to, from, fromUsername, offer } = data
    console.log(`[OFFER] ${fromUsername} sending offer to ${to} in ${meetingCode}`)

    const participants = getMeetingParticipants(meetingCode)
    const targetParticipant = participants.get(to)

    if (targetParticipant) {
      io.to(targetParticipant.socketId).emit("offer", {
        from,
        fromUsername,
        offer,
      })
    }
  })

  // Relay answer only to intended recipient
  socket.on("answer", (data) => {
    const { meetingCode, to, from, fromUsername, answer } = data
    console.log(`[ANSWER] ${fromUsername} sending answer to ${to} in ${meetingCode}`)

    const participants = getMeetingParticipants(meetingCode)
    const targetParticipant = participants.get(to)

    if (targetParticipant) {
      io.to(targetParticipant.socketId).emit("answer", {
        from,
        fromUsername,
        answer,
      })
    }
  })

  // Relay ICE candidate only to intended recipient
  socket.on("ice-candidate", (data) => {
    const { meetingCode, to, from, candidate } = data

    const participants = getMeetingParticipants(meetingCode)
    const targetParticipant = participants.get(to)

    if (targetParticipant) {
      io.to(targetParticipant.socketId).emit("ice-candidate", {
        from,
        candidate,
      })
    }
  })

  // User leaves meeting
  socket.on("leave-meeting", (data) => {
    const { meetingCode, userId, username } = data
    console.log(`[MEETING] ${username} leaving meeting ${meetingCode}`)

    socket.leave(meetingCode)

    const participants = getMeetingParticipants(meetingCode)
    participants.delete(userId)

    socket.to(meetingCode).emit("user-left", {
      userId,
      username,
    })

    if (participants.size === 0) {
      meetings.delete(meetingCode)
      console.log(`[MEETING] Meeting ${meetingCode} is now empty`)
    }
  })

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`[SOCKET] User disconnected: ${socket.id}`)

    // Clean up any meetings where this user was a participant
    for (const [meetingCode, participants] of meetings.entries()) {
      for (const [userId, participant] of participants.entries()) {
        if (participant.socketId === socket.id) {
          participants.delete(userId)
          io.to(meetingCode).emit("user-left", {
            userId,
            username: participant.username,
          })

          if (participants.size === 0) {
            meetings.delete(meetingCode)
          }
        }
      }
    }
  })

  socket.on("error", (error) => {
    console.error(`[SOCKET] Error: ${error}`)
  })
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`)
})
