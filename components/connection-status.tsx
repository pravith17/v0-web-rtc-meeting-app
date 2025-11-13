"use client"

interface ConnectionStatusProps {
  signalingConnected: boolean
  remoteCount: number
  signalingServerUrl?: string
}

export function ConnectionStatus({ signalingConnected, remoteCount, signalingServerUrl }: ConnectionStatusProps) {
  return (
    <div className="fixed bottom-4 left-4 bg-gray-900 text-white px-4 py-2 rounded-lg text-xs font-mono z-50 max-w-xs">
      <div className="flex flex-col gap-2">
        <div>
          Signaling:{" "}
          <span className={signalingConnected ? "text-green-400" : "text-red-400"}>
            {signalingConnected ? "✓ Connected" : "✗ Disconnected"}
          </span>
        </div>
        <div>Remotes: {remoteCount}</div>
        <div className="text-gray-400 break-words">
          {signalingServerUrl ? signalingServerUrl : "⚠️ No signaling URL set"}
        </div>
        {!signalingConnected && (
          <div className="text-yellow-400 text-xs mt-1">
            Check if env var NEXT_PUBLIC_SIGNALING_SERVER_URL is set in Vercel
          </div>
        )}
      </div>
    </div>
  )
}
