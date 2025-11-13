"use client"

import { useRef, useEffect, useState } from "react"
import { Mic, MicOff, Video, VideoOff, Share2, Phone, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RemoteStream {
  id: string
  stream: MediaStream
  username?: string
}

interface VideoGridProps {
  localStream: MediaStream | null
  remoteStreams: RemoteStream[]
  localUsername: string
  isMuted: boolean
  isVideoOff: boolean
  isSharing: boolean
  onToggleMute: () => void
  onToggleVideo: () => void
  onToggleShare: () => void
  onLeave: () => void
  error?: string | null
  onErrorDismiss?: () => void
  activeSpeaker?: string | null
}

export function VideoGrid({
  localStream,
  remoteStreams,
  localUsername,
  isMuted,
  isVideoOff,
  isSharing,
  onToggleMute,
  onToggleVideo,
  onToggleShare,
  onLeave,
  error,
  onErrorDismiss,
  activeSpeaker,
}: VideoGridProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteRefs = useRef<Record<string, HTMLVideoElement>>({})
  const [showError, setShowError] = useState(false)

  useEffect(() => {
    if (error) {
      setShowError(true)
    }
  }, [error])

  const handleDismissError = () => {
    setShowError(false)
    onErrorDismiss?.()
  }

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    remoteStreams.forEach((remote) => {
      const videoElement = remoteRefs.current[remote.id]
      if (videoElement) {
        if (videoElement.srcObject !== remote.stream) {
          console.log(`[v0] Setting video element srcObject for ${remote.id}`)
          videoElement.srcObject = remote.stream
        }
      }
    })
  }, [remoteStreams])

  const gridColsClass =
    remoteStreams.length === 0
      ? ""
      : remoteStreams.length === 1
        ? "md:grid-cols-2"
        : remoteStreams.length <= 4
          ? "md:grid-cols-2 lg:grid-cols-2"
          : "md:grid-cols-3"

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      {/* Error Notification */}
      {showError && error && (
        <div className="fixed top-4 left-4 right-4 bg-red-900/90 border border-red-600 text-white px-4 py-3 rounded-lg flex items-start justify-between gap-3 z-50 max-w-md animate-in fade-in slide-in-from-top-2">
          <div className="flex-1">
            <p className="font-medium text-sm">{error}</p>
          </div>
          <button
            onClick={handleDismissError}
            className="text-red-200 hover:text-white flex-shrink-0 mt-0.5"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Video Grid */}
      <div className={`flex-1 grid grid-cols-1 ${gridColsClass} gap-2 p-4 overflow-auto`}>
        {/* Local Video */}
        <div className="relative bg-gray-900 rounded-lg overflow-hidden h-full min-h-[300px]">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
            {localUsername} (You)
          </div>
          {isVideoOff && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
                <VideoOff className="w-8 h-8" />
              </div>
            </div>
          )}
        </div>

        {/* Remote Videos */}
        {remoteStreams.map((remote) => (
          <div
            key={remote.id}
            className={`relative bg-gray-900 rounded-lg overflow-hidden h-full min-h-[300px] transition-all duration-200 ${
              activeSpeaker === remote.id ? "ring-4 ring-green-500" : ""
            }`}
          >
            <video
              ref={(el) => {
                if (el) remoteRefs.current[remote.id] = el
              }}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {activeSpeaker === remote.id && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/90 text-white px-2 py-1 rounded text-xs font-medium">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Speaking
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
              {remote.username || "User"}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-gray-900 border-t border-gray-700 px-4 py-4 flex items-center justify-center gap-3">
        <Button
          onClick={onToggleMute}
          variant={isMuted ? "destructive" : "default"}
          size="icon"
          className="rounded-full w-12 h-12"
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </Button>

        <Button
          onClick={onToggleVideo}
          variant={isVideoOff ? "destructive" : "default"}
          size="icon"
          className="rounded-full w-12 h-12"
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </Button>

        <Button
          onClick={onToggleShare}
          variant={isSharing ? "secondary" : "default"}
          size="icon"
          className="rounded-full w-12 h-12"
        >
          <Share2 className="w-5 h-5" />
        </Button>

        <div className="w-px h-8 bg-gray-700" />

        <Button onClick={onLeave} variant="destructive" size="icon" className="rounded-full w-12 h-12">
          <Phone className="w-5 h-5" />
        </Button>
      </div>
    </div>
  )
}
