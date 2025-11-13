"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { VideoGrid } from "./video-grid"
import { ConnectionStatus } from "./connection-status"
import type { RealtimeChannel } from "@supabase/supabase-js"

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

  const channelRef = useRef<RealtimeChannel | null>(null)
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
        const stream = await navigator.mediaDevices.getUserMedia(constraintLevels[i])
        setError(null)
        return stream
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) {
      let errorMessage = "Failed to access camera/microphone"
      if (lastError.message.includes("Permission denied") || lastError.message.includes("NotAllowedError")) {
        errorMessage =
          "Permission Denied: Your browser blocked camera/microphone access. Please allow access in browser settings and refresh the page."
      } else if (lastError.message.includes("NotFoundError")) {
        errorMessage = "No camera or microphone found. Please check your device has these peripherals."
      }
      setError(errorMessage)
      throw new Error(errorMessage)
    }

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

        const channel = supabase.channel(`meeting:${meetingCode}`, {
          config: {
            broadcast: { self: false },
            presence: { key: user.id },
          },
        })

        channel.on("presence", { event: "sync" }, () => {
          console.log("[v0] Presence sync")
          setSignalingConnected(true)

          const presenceState = channel.presenceState()
          const presentUsers = Object.values(presenceState).flat()

          // Create peer connections for all present users
          presentUsers.forEach((presence: any) => {
            if (presence.user_id !== user.id) {
              if (!peersRef.current.has(presence.user_id)) {
                createPeerConnection(presence.user_id, presence.username, true)
              }
            }
          })
        })

        channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
          const newUser = newPresences[0]
          if (newUser.user_id !== user.id) {
            createPeerConnection(newUser.user_id, newUser.username, true)
          }
        })

        channel.on("presence", { event: "leave" }, ({ key }) => {
          const peerConnection = peersRef.current.get(key)?.peerConnection
          if (peerConnection) {
            peerConnection.close()
          }
          peersRef.current.delete(key)
          setRemoteStreams((prev) => prev.filter((s) => s.id !== key))
          delete analyzerRefs.current[key]
        })

        // Handle signaling messages
        channel.on("broadcast", { event: "offer" }, ({ payload }) => {
          if (payload.to === user.id || !payload.to) {
            handleOffer(payload.from, payload.offer, payload.fromUsername)
          }
        })

        channel.on("broadcast", { event: "answer" }, ({ payload }) => {
          if (payload.to === user.id || !payload.to) {
            handleAnswer(payload.from, payload.answer)
          }
        })

        channel.on("broadcast", { event: "ice-candidate" }, ({ payload }) => {
          if (payload.to === user.id || !payload.to) {
            handleIceCandidate(payload.from, payload.candidate)
          }
        })

        await channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            console.log("[v0] Subscribed to meeting channel")
            await channel.track({
              user_id: user.id,
              username: username,
            })
          }
        })

        channelRef.current = channel
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
      return
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    })

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current!)
      })
    }

    peerConnection.onicecandidate = async (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: {
            from: userIdRef.current,
            to: peerId,
            candidate: event.candidate,
          },
        })
      }
    }

    peerConnection.ontrack = (event) => {
      console.log("[v0] Received remote track:", event.track.kind)
      const remoteStream = event.streams[0]
      if (!remoteStream) return

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
          updated[existingIndex] = { ...updated[existingIndex], stream: remoteStream, username: peerUsername }
          return updated
        }
        return [...prev, { id: peerId, stream: remoteStream, username: peerUsername }]
      })
    }

    peerConnection.onconnectionstatechange = () => {
      console.log("[v0] Peer connection state:", peerConnection.connectionState)
      if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "closed") {
        peersRef.current.delete(peerId)
        setRemoteStreams((prev) => prev.filter((s) => s.id !== peerId))
        delete analyzerRefs.current[peerId]
      }
    }

    peersRef.current.set(peerId, { peerConnection, username: peerUsername })

    if (initiator && localStreamRef.current) {
      try {
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "offer",
            payload: {
              from: userIdRef.current,
              to: peerId,
              fromUsername: username,
              offer,
            },
          })
        }
      } catch (err) {
        console.error("Error creating offer:", err)
      }
    }
  }

  const handleOffer = async (peerId: string, offer: RTCSessionDescriptionInit, fromUsername?: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    let peerConnection = peersRef.current.get(peerId)?.peerConnection

    if (!peerConnection) {
      peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS })

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          peerConnection!.addTrack(track, localStreamRef.current!)
        })
      }

      peerConnection.onicecandidate = async (event) => {
        if (event.candidate && channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: {
              from: userIdRef.current,
              to: peerId,
              candidate: event.candidate,
            },
          })
        }
      }

      peerConnection.ontrack = (event) => {
        console.log("[v0] Received remote track:", event.track.kind)
        const remoteStream = event.streams[0]
        if (!remoteStream) return

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
            updated[existingIndex] = { ...updated[existingIndex], stream: remoteStream, username: fromUsername }
            return updated
          }
          return [...prev, { id: peerId, stream: remoteStream, username: fromUsername }]
        })
      }

      peerConnection.onconnectionstatechange = () => {
        console.log("[v0] Peer connection state:", peerConnection.connectionState)
        if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "closed") {
          peersRef.current.delete(peerId)
          setRemoteStreams((prev) => prev.filter((s) => s.id !== peerId))
          delete analyzerRefs.current[peerId]
        }
      }

      peersRef.current.set(peerId, { peerConnection, username: fromUsername })
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "answer",
          payload: {
            from: userIdRef.current,
            to: peerId,
            answer,
          },
        })
      }
    } catch (err) {
      console.error("Error handling offer:", err)
    }
  }

  const handleAnswer = async (peerId: string, answer: RTCSessionDescriptionInit) => {
    const peerConnection = peersRef.current.get(peerId)?.peerConnection
    if (peerConnection) {
      try {
        console.log("[v0] Setting remote description from answer")
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (err) {
        console.error("Error handling answer:", err)
      }
    }
  }

  const handleIceCandidate = async (peerId: string, candidate: RTCIceCandidateInit) => {
    const peerConnection = peersRef.current.get(peerId)?.peerConnection
    if (peerConnection) {
      try {
        console.log("[v0] Adding ICE candidate")
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error("Error adding ICE candidate:", err)
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
      }
    } catch (screenErr) {
      const errorMsg = screenErr instanceof Error ? screenErr.message : "Unknown error"
      if (errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
        setError("Screen sharing permission denied. Please allow access in your browser settings.")
      } else if (errorMsg.includes("NotFoundError")) {
        setError("No screen or window selected. Please try again.")
      } else {
        setError(`Screen sharing error: ${errorMsg}`)
      }
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

    if (channelRef.current) {
      channelRef.current.unsubscribe()
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

      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }

      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  return (
    <>
      <ConnectionStatus signalingConnected={signalingConnected} remoteCount={remoteStreams.length} />
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
