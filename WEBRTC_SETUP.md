# WebRTC Meeting App - Built-in WebSocket Signaling

## Overview

This WebRTC application uses **Next.js API Routes with WebSocket** for signaling. No external server needed - everything runs on your Vercel deployment.

## Key Features

✓ Real-time video/audio conferencing
✓ Screen sharing
✓ Meeting codes for easy sharing
✓ Speaker detection with green border highlight
✓ Works on Vercel free tier
✓ No additional infrastructure costs
✓ Peer-to-peer WebRTC connections (not dependent on server for media)

## How It Works

1. **WebSocket Signaling** - Built into Next.js API route at `/api/webrtc`
2. **Peer-to-Peer Media** - Video/audio flows directly between browsers (not through server)
3. **Same-Origin Connection** - Uses `ws://` or `wss://` on your deployed domain
4. **Automatic Routing** - Offers/Answers/ICE candidates routed to correct peer

## Local Development

### 1. Start Your Next.js App

\`\`\`bash
npm run dev
\`\`\`

The WebSocket server is automatically available at `ws://localhost:3000/api/webrtc`

### 2. Test Locally

- Open `http://localhost:3000` in your browser
- Sign up and create a meeting
- Open the meeting URL in a second browser tab/window
- Video, audio, and screen sharing should work

## Deployment to Production

### 1. Deploy to Vercel

\`\`\`bash
git push
\`\`\`

Vercel automatically deploys your Next.js app with the WebSocket API route.

### 2. That's It!

Your deployed app at `https://your-app.vercel.app` now has:
- WebSocket signaling server built-in at `wss://your-app.vercel.app/api/webrtc`
- All WebRTC features working

### 3. Share with Others

Users can:
1. Visit `https://your-app.vercel.app`
2. Sign up
3. Create a meeting (get a 6-digit code)
4. Share the code with others
5. Others visit the same URL, join with the code
6. Video/audio works in real-time

## Architecture

\`\`\`
Browser 1                        Browser 2
   |                               |
   |------ WebSocket (Signaling)---|
   |       (Offers, Answers, ICE)  |
   |                               |
   |------ WebRTC Peer Connection--|
   |       (Video & Audio)         |
   |                               |
\`\`\`

- **WebSocket** (blue line): Relay signaling messages through `/api/webrtc`
- **WebRTC** (red line): Direct peer-to-peer connection for media

## Environment Variables

No external environment variables needed! The app automatically detects and connects to `wss://your-domain/api/webrtc`.

## Troubleshooting

### "Signaling: Disconnected"

**Problem**: WebSocket not connecting

**Solutions**:
1. Check browser console (F12 → Console) for errors
2. Verify your app is deployed and running
3. Check Network tab in DevTools - look for WebSocket connection to `/api/webrtc`
4. Make sure you're using HTTPS on production (not HTTP)

### Remote video/audio not showing

**Problems & Solutions**:
1. **Check local video first** - You should see your own video before testing with others
2. **Verify both users in same meeting** - Share the exact meeting code
3. **Check camera/mic permissions** - Grant access in browser settings
4. **Check firewall** - Some networks block WebRTC. Try on different network
5. **Check browser console** - Look for error messages starting with `[v0]`

### "Failed to access camera/microphone"

This means browser permissions are blocked:
1. Check browser URL bar - click the lock icon
2. Find "Camera" and "Microphone" permissions
3. Set them to "Allow"
4. Refresh the page

### App works locally but not on Vercel

**Problem**: Preview works but deployed version fails

**Solutions**:
1. Make sure you pushed the latest code to GitHub
2. Check Vercel deployment logs (Vercel Dashboard → Deployments)
3. Look for errors related to WebSocket API routes
4. Clear browser cache and hard refresh (Ctrl+Shift+R)

## Performance Tips

- **Best results**: Chrome, Firefox, or Edge on desktop
- **Mobile**: Works but may have limitations with some devices
- **Bandwidth**: Each peer connection uses ~500KB-1MB/s for HD video
- **Latency**: Direct peer-to-peer, so very low latency (minimal delay)

## Scale Limitations

- **Number of participants**: Works best with 2-6 people in a meeting
- **Why**: Each person's video stream to all others (O(n²) scaling)
- **For 100+ participants**: Use a media server (Jitsi, Daily.co, etc)

## File Structure

\`\`\`
app/
  api/
    webrtc/
      route.ts          ← WebSocket signaling server
  meeting/
    [code]/
      page.tsx          ← Meeting room page
  home/
    page.tsx            ← Create/join meeting
  auth/                 ← Authentication

components/
  webrtc-room.tsx       ← Main WebRTC logic
  video-grid.tsx        ← Display video/audio
  connection-status.tsx ← Connection indicator
\`\`\`

## Next Steps

1. **Deploy**: Push to GitHub → auto-deploys to Vercel
2. **Share**: Send deployed URL to friends
3. **Test**: Create meeting, share code, join with another user
4. **Debug**: Check browser console for `[v0]` messages if issues occur

## Support

If you encounter issues:
1. Check browser console (F12 → Console tab)
2. Look for errors starting with `[v0]` - these are diagnostic messages
3. Verify WebSocket connection in Network tab (should see `/api/webrtc` with status 101)
4. Check Vercel deployment logs for backend errors

Enjoy your WebRTC meeting app!
