# WebRTC Signaling Server Setup & Deployment

## What is a Signaling Server?

The signaling server is a Node.js application that coordinates WebRTC connections between peers. It:
- Manages meeting rooms and participants
- Routes offer/answer/ICE candidates between peers
- Handles user join/leave events
- Acts as a message relay (NOT the actual video/audio connection)

**Important**: The signaling server does NOT carry video/audio data. Only the peer-to-peer WebRTC connections do that.

## Local Development

### 1. Install Dependencies

\`\`\`bash
npm install express socket.io cors
# OR if using the provided package.json
npm install --save-dev nodemon
\`\`\`

### 2. Run Locally

\`\`\`bash
node signaling-server.js
# Or with auto-reload:
npm run dev
\`\`\`

You should see: `Signaling server running on port 5000`

### 3. Update Your App

Set this environment variable in your `.env.local`:
\`\`\`
NEXT_PUBLIC_SIGNALING_SERVER_URL=http://localhost:5000
\`\`\`

Then restart your Next.js app and test locally.

## Production Deployment

### Option 1: Deploy to Render (Recommended - FREE)

#### Step 1: Create a GitHub Repository

\`\`\`bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/webrtc-signaling.git
git push -u origin main
\`\`\`

#### Step 2: Deploy to Render

1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Fill in settings:
   - **Name**: `webrtc-signaling`
   - **Root Directory**: `.` (or where signaling-server.js is)
   - **Build Command**: `npm install`
   - **Start Command**: `node signaling-server.js`
   - **Instance Type**: Free (0.5 CPU, 512MB RAM is enough)
5. Click "Create Web Service"
6. Render will give you a URL like: `https://webrtc-signaling-xxxxx.onrender.com`

#### Step 3: Update Your Next.js App

In Vercel project settings, add environment variable:
\`\`\`
NEXT_PUBLIC_SIGNALING_SERVER_URL=https://webrtc-signaling-xxxxx.onrender.com
\`\`\`

### Option 2: Deploy to Railway.app

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select your repository
4. Railway auto-detects Node.js
5. Add environment variable in dashboard (if needed)
6. Railway generates URL: `https://your-app.railway.app`

### Option 3: Deploy to Heroku (Paid)

\`\`\`bash
heroku login
heroku create webrtc-signaling
git push heroku main
\`\`\`

## Verify Deployment

1. Go to your deployed signaling server URL in browser
2. You should see a connection message or blank page (that's normal)
3. Open browser console and run:
   \`\`\`javascript
   const socket = io('https://your-signaling-url.com');
   socket.on('connect', () => console.log('Connected!'));
   \`\`\`

## Update Your Deployed Web App

1. In Vercel Dashboard → Settings → Environment Variables
2. Update: `NEXT_PUBLIC_SIGNALING_SERVER_URL=https://your-signaling-url.com`
3. Redeploy your Next.js app
4. Test with 2+ users joining a meeting

## Troubleshooting

### "Signaling server not responding"

- Check if the server is running: visit the URL in browser
- Check CORS settings in signaling-server.js (should allow all origins: `*`)
- Make sure you're using `https://` for production (not `http://`)

### "Connection refused"

- Verify the server is deployed and running
- Check the environment variable is set correctly
- Make sure there are no typos in the URL

### "Remote streams still not showing"

- Check browser console for detailed errors
- Make sure both users are in the same meeting room
- Verify both users have granted camera/microphone permissions
- Check that local stream is working first (you should see your own video)

## Signaling Server Log Files

Most hosting platforms provide log access:

- **Render**: Dashboard → Logs
- **Railway**: Dashboard → Logs  
- **Heroku**: `heroku logs --tail`

Look for errors like:
- `[OFFER] User sending offer`
- `[ANSWER] User sending answer`
- `[ICE] Relaying ICE candidate`

If you don't see these, the WebRTC component isn't connecting to the signaling server.

## Cost Estimate

- **Render Free Tier**: $0/month (auto-sleeps after 15 min of inactivity, but wakes up when accessed)
- **Railway**: ~$5/month (1GB RAM, 100GB bandwidth)
- **Heroku**: Paid plans start at $7/month (free tier no longer available)

For a production app, **Render Free or Railway** are recommended.

## What to Tell Users

Once deployed, users can:
1. Go to your app URL (e.g., `https://my-webrtc-app.vercel.app`)
2. Sign up or log in
3. Create a meeting (they get a code)
4. Share the code with others
5. Others join using that code
6. Video/audio should work in real-time!

## Next Steps

If remote streams still don't show after deploying the signaling server:
1. Check the signaling server logs
2. Make sure the `NEXT_PUBLIC_SIGNALING_SERVER_URL` is set correctly
3. Verify Socket.io is connecting (check browser DevTools → Network)
4. Contact support with the logs
