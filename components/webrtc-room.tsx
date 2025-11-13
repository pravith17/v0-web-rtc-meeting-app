"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { VideoGrid } from "./video-grid"
import { io, type Socket } from "socket.io-client"
import { ConnectionStatus } from "./connection-status"

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }]

interface RemotePeer {
  peerConnection: RTCPeerConnection
  username?: string
}

interface RemoteStream {
  id: string
  stream: MediaStream
  username?: string
}

interface WebRTCRoomProps {
  meetingCode: string
  username: string
}

export function WebRTCRoom({ meetingCode, username }: WebRTCRoomProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)
  const [signalingConnected, setSignalingConnected] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const peersRef = useRef<Map<string, RemotePeer>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const userIdRef = useRef<string>("")
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyzerRefs = useRef<Record<string, AnalyserNode>>({})

  const router = useRouter()
  const supabase = createClient()

  const getMediaStream = async (): Promise<MediaStream> => {
    const constraintLevels = [
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true },
      { video: { width: { max: 1280 }, height: { max: 720 } }, audio: true },
      { video: true, audio: true },
      { video: false, audio: true },
    ]

    let lastError: Error | null = null

    for (let i = 0; i < constraintLevels.length; i++) {
      try {
        console.log(`[v0] Attempting getUserMedia with constraint level ${i + 1}`)
        const stream = await navigator.mediaDevices.getUserMedia(constraintLevels[i])
        console.log(`[v0] Successfully got media stream with constraint level ${i + 1}`)
        setError(null)
        return stream
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.log(`[v0] Constraint level ${i + 1} failed: ${lastError.message}`)
      }
    }

    if (lastError) {
      let errorMessage = "Failed to access camera/microphone"
      if (lastError.message.includes("Permission denied") || lastError.message.includes("NotAllowedError")) {
        errorMessage =
          "Permission Denied: Your browser blocked camera/microphone access. Please allow access in browser settings and refresh the page."
      } else if (lastError.message.includes("NotFoundError")) {
        errorMessage = "No camera or microphone found. Please check your device has these peripherals."
      } else {
        errorMessage = `Failed to access camera/microphone: ${lastError.message}`
      }
      setError(errorMessage)
      throw new Error(errorMessage)
    }

    setError("Failed to get media stream after all attempts")
    throw new Error("Failed to get media stream after all attempts")
  }

  useEffect(() => {
    let isSubscribed = true

    const initializeCall = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.push("/auth/login")
          return
        }

        userIdRef.current = user.id

        let stream: MediaStream | null = null
        try {
          stream = await getMediaStream()
        } catch (mediaErr) {
          console.error("Failed to get media stream:", mediaErr)
          return
        }

        if (!isSubscribed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        localStreamRef.current = stream
        setLocalStream(stream)

        const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || "http://localhost:5000"
        console.log(`[v0] Connecting to signaling server at ${signalingUrl}`)

        const socket = io(signalingUrl, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
        })

        socketRef.current = socket

        socket.on("connect", () => {
          console.log("[v0] Connected to signaling server")
          setSignalingConnected(true)
          socket.emit(
            "join-meeting",
            {
              meetingCode,
              userId: user.id,
              username,
            },
            (response: any) => {
              if (response.success) {
                console.log(`[v0] Joined meeting ${meetingCode}`)
                console.log(`[v0] Initial participants: ${response.participants.length}`)
                response.participants.forEach((participant: any) => {
                  if (participant.userId !== user.id) {
                    createPeerConnection(participant.userId, participant.username, true)
                  }
                })
              } else {
                console.error("[v0] Failed to join meeting:", response.error)
              }
            },
          )
        })

        socket.on("user-joined", (data: any) => {
          console.log(`[v0] User ${data.username} joined`)
          createPeerConnection(data.userId, data.username, true)
        })

        socket.on("offer", async (data: any) => {
          console.log(`[v0] Received offer from ${data.from}`)
          if (data.from) {
            await handleOffer(data.from, data.offer, data.fromUsername)
          }
        })

        socket.on("answer", async (data: any) => {
          console.log(`[v0] Received answer from ${data.from}`)
          if (data.from) {
            await handleAnswer(data.from, data.answer)
          }
        })

        socket.on("ice-candidate", async (data: any) => {
          console.log(`[v0] Received ICE candidate from ${data.from}`)
          if (data.from) {
            await handleIceCandidate(data.from, data.candidate)
          }
        })

        socket.on("user-left", (data: any) => {
          console.log(`[v0] User ${data.username} left`)
          const peerConnection = peersRef.current.get(data.userId)?.peerConnection
          if (peerConnection) {
            peerConnection.close()
          }
          peersRef.current.delete(data.userId)
          setRemoteStreams((prev) => prev.filter((s) => s.id !== data.userId))
          delete analyzerRefs.current[data.userId]
        })

        socket.on("disconnect", () => {
          console.log("[v0] Disconnected from signaling server")
          setSignalingConnected(false)
          setError("Disconnected from server. Reconnecting...")
        })

        socket.on("error", (error: any) => {
          console.error("[v0] Socket error:", error)
          setError(`Connection error: ${error}`)
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to initialize call"
        setError(message)
        console.error("Error initializing call:", err)
      }
    }

    initializeCall()

    return () => {
      isSubscribed = false
    }
  }, [meetingCode, username, router, supabase])

  const createPeerConnection = async (peerId: string, peerUsername?: string, initiator?: boolean) => {
    if (peersRef.current.has(peerId)) {
      console.log(`[v0] Peer connection already exists for ${peerId}`)
      return
    }

    console.log(`[v0] Creating peer connection with ${peerId} (initiator: ${initiator})`)

    const peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    })

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`[v0] Adding local ${track.kind} track to peer ${peerId}`)
        peerConnection.addTrack(track, localStreamRef.current!)
      })
    } else {
      console.warn(`[v0] No local stream available for peer ${peerId}`)
    }

    peerConnection.onicecandidate = async (event) => {
      if (event.candidate && socketRef.current) {
        console.log(`[v0] Sending ICE candidate to ${peerId}`)
        socketRef.current.emit("ice-candidate", {
          meetingCode,
          from: userIdRef.current,
          to: peerId,
          candidate: event.candidate,
        })
      }
    }

    peerConnection.ontrack = (event) => {
      console.log(`[v0] Received remote ${event.track.kind} track from ${peerId}`)

      const remoteStream = event.streams[0]
      if (!remoteStream) {
        console.warn(`[v0] No remote stream available`)
        return
      }

      if (event.track.kind === "audio") {
        if (audioContextRef.current) {
          try {
            const source = audioContextRef.current.createMediaStreamSource(remoteStream)
            const analyser = audioContextRef.current.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            analyzerRefs.current[peerId] = analyser
            console.log(`[v0] Setup speaker detection for peer ${peerId}`)
          } catch (err) {
            console.error("Error setting up speaker detection:", err)
          }
        }
      }

      setRemoteStreams((prev) => {
        const existingIndex = prev.findIndex((s) => s.id === peerId)
        if (existingIndex >= 0) {
          const updated = [...prev]
          updated[existingIndex] = { ...updated[existingIndex], stream: remoteStream }
          return updated
        }
        return [...prev, { id: peerId, stream: remoteStream, username: peerUsername }]
      })
    }

    peerConnection.onconnectionstatechange = () => {
      console.log(`[v0] Connection state with ${peerId}: ${peerConnection.connectionState}`)
      if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "closed") {
        console.log(`[v0] Removing failed peer ${peerId}`)
        peersRef.current.delete(peerId)
        setRemoteStreams((prev) => prev.filter((s) => s.id !== peerId))
        delete analyzerRefs.current[peerId]
      }
    }

    peersRef.current.set(peerId, { peerConnection, username: peerUsername })

    if (initiator && localStreamRef.current) {
      try {
        console.log(`[v0] Creating offer for peer ${peerId}`)
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        if (socketRef.current) {
          socketRef.current.emit("offer", {
            meetingCode,
            from: userIdRef.current,
            to: peerId,
            fromUsername: username,
            offer,
          })
        }
        console.log(`[v0] Sent offer to ${peerId}`)
      } catch (err) {
        console.error(`[v0] Error creating offer for ${peerId}:`, err)
      }
    }
  }

  const handleOffer = async (peerId: string, offer: RTCSessionDescriptionInit, fromUsername?: string) => {
    console.log(`[v0] Handling offer from ${peerId}`)
    let peerConnection = peersRef.current.get(peerId)?.peerConnection

    if (!peerConnection) {
      console.log(`[v0] Creating new peer connection for offer from ${peerId}`)
      peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS })

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          console.log(`[v0] Adding local ${track.kind} track to offer peer ${peerId}`)
          peerConnection!.addTrack(track, localStreamRef.current!)
        })
      }

      peerConnection.onicecandidate = async (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit("ice-candidate", {
            meetingCode,
            from: userIdRef.current,
            to: peerId,
            candidate: event.candidate,
          })
        }
      }

      peerConnection.ontrack = (event) => {
        console.log(`[v0] Received remote ${event.track.kind} track from offer peer ${peerId}`)

        const remoteStream = event.streams[0]
        if (!remoteStream) {
          console.warn(`[v0] No remote stream available from offer peer`)
          return
        }

        if (event.track.kind === "audio") {
          if (audioContextRef.current) {
            try {
              const source = audioContextRef.current.createMediaStreamSource(remoteStream)
              const analyser = audioContextRef.current.createAnalyser()
              analyser.fftSize = 256
              source.connect(analyser)
              analyzerRefs.current[peerId] = analyser
            } catch (err) {
              console.error("Error setting up speaker detection:", err)
            }
          }
        }

        setRemoteStreams((prev) => {
          const existingIndex = prev.findIndex((s) => s.id === peerId)
          if (existingIndex >= 0) {
            const updated = [...prev]
            updated[existingIndex] = { ...updated[existingIndex], stream: remoteStream }
            return updated
          }
          return [...prev, { id: peerId, stream: remoteStream, username: fromUsername }]
        })
      }

      peerConnection.onconnectionstatechange = () => {
        console.log(`[v0] Connection state with offer peer ${peerId}: ${peerConnection.connectionState}`)
        if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "closed") {
          peersRef.current.delete(peerId)
          setRemoteStreams((prev) => prev.filter((s) => s.id !== peerId))
          delete analyzerRefs.current[peerId]
        }
      }

      peersRef.current.set(peerId, { peerConnection })
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      console.log(`[v0] Sending answer to ${peerId}`)
      if (socketRef.current) {
        socketRef.current.emit("answer", {
          meetingCode,
          from: userIdRef.current,
          to: peerId,
          fromUsername: username,
          answer,
        })
      }
    } catch (err) {
      console.error(`[v0] Error handling offer from ${peerId}:`, err)
    }
  }

  const handleAnswer = async (peerId: string, answer: RTCSessionDescriptionInit) => {
    console.log(`[v0] Handling answer from ${peerId}`)
    const peerConnection = peersRef.current.get(peerId)?.peerConnection
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
        console.log(`[v0] Remote description set for ${peerId}`)
      } catch (err) {
        console.error(`[v0] Error handling answer from ${peerId}:`, err)
      }
    }
  }

  const handleIceCandidate = async (peerId: string, candidate: RTCIceCandidateInit) => {
    const peerConnection = peersRef.current.get(peerId)?.peerConnection
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error(`[v0] Error adding ICE candidate from ${peerId}:`, err)
      }
    }
  }

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsVideoOff(!isVideoOff)
    }
  }

  const toggleScreenShare = async () => {
    try {
      if (isSharing && screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
        const videoTrack = localStreamRef.current?.getVideoTracks()[0]
        if (videoTrack) {
          peersRef.current.forEach(({ peerConnection }) => {
            const sender = peerConnection.getSenders().find((s) => s.track?.kind === "video")
            if (sender) sender.replaceTrack(videoTrack)
          })
        }
        screenStreamRef.current = null
        setIsSharing(false)
        setError(null)
      } else {
        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: false,
          })

          screenStreamRef.current = screenStream
          const screenTrack = screenStream.getVideoTracks()[0]
          peersRef.current.forEach(({ peerConnection }) => {
            const sender = peerConnection.getSenders().find((s) => s.track?.kind === "video")
            if (sender) sender.replaceTrack(screenTrack)
          })

          setIsSharing(true)
          setError(null)

          screenStream.getVideoTracks()[0].onended = async () => {
            const videoTrack = localStreamRef.current?.getVideoTracks()[0]
            if (videoTrack) {
              peersRef.current.forEach(({ peerConnection }) => {
                const sender = peerConnection.getSenders().find((s) => s.track?.kind === "video")
                if (sender) sender.replaceTrack(videoTrack)
              })
            }
            screenStreamRef.current = null
            setIsSharing(false)
          }
        } catch (screenErr) {
          const errorMsg = screenErr instanceof Error ? screenErr.message : "Unknown error"
          if (errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
            setError("Screen sharing permission denied. Please allow access in your browser settings.")
          } else if (errorMsg.includes("NotFoundError")) {
            setError("No screen or window selected. Please try again.")
          } else if (errorMsg.includes("display-capture")) {
            setError(
              "Screen sharing is not supported in your browser or is disabled by policy. Try Chrome, Edge, or Firefox.",
            )
          } else {
            setError(`Screen sharing error: ${errorMsg}`)
          }
          console.error("Error starting screen share:", screenErr)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(`Failed to toggle screen share: ${message}`)
      console.error("Error toggling screen share:", err)
    }
  }

  const leaveMeeting = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop())
    }

    peersRef.current.forEach(({ peerConnection }) => {
      peerConnection.close()
    })
    peersRef.current.clear()

    if (socketRef.current) {
      socketRef.current.emit("leave-meeting", {
        meetingCode,
        userId: userIdRef.current,
        username,
      })
      socketRef.current.disconnect()
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    router.push("/home")
  }

  useEffect(() => {
    if (!audioContextRef.current && typeof window !== "undefined") {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
  }, [])

  useEffect(() => {
    let animationFrameId: number

    const detectSpeaker = () => {
      const dataArray = new Uint8Array(256)
      let maxVolume = 0
      let activePeerId: string | null = null

      Object.entries(analyzerRefs.current).forEach(([peerId, analyser]) => {
        analyser.getByteFrequencyData(dataArray)
        const volume = dataArray.reduce((a, b) => a + b) / dataArray.length
        if (volume > maxVolume) {
          maxVolume = volume
          activePeerId = peerId
        }
      })

      if (maxVolume > 30) {
        setActiveSpeaker(activePeerId)
      } else {
        setActiveSpeaker(null)
      }

      animationFrameId = requestAnimationFrame(detectSpeaker)
    }

    if (Object.keys(analyzerRefs.current).length > 0) {
      detectSpeaker()
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [remoteStreams])

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }

      peersRef.current.forEach(({ peerConnection }) => {
        peerConnection.close()
      })
      peersRef.current.clear()

      if (socketRef.current) {
        socketRef.current.disconnect()
      }

      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  return (
    <>
      <ConnectionStatus
        signalingConnected={signalingConnected}
        remoteCount={remoteStreams.length}
        signalingServerUrl={process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL}
      />
      <VideoGrid
        localStream={localStream}
        remoteStreams={remoteStreams}
        localUsername={username}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isSharing={isSharing}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onToggleShare={toggleScreenShare}
        onLeave={leaveMeeting}
        error={error}
        onErrorDismiss={() => setError(null)}
        activeSpeaker={activeSpeaker}
      />
    </>
  )
}
