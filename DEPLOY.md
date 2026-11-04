# Put CloudPlay online (needed for the iPhone app)

The iPhone app, and the Home Screen version, are windows onto **your CloudPlay server**. If no server is online, the app shows "Can't reach your CloudPlay server". Follow these steps once.

## Option 1: Render (recommended, about 10 minutes)

Render runs the included `Dockerfile` and gives you an `https://` address automatically.

1. Create an account at https://render.com and sign in with GitHub.
2. Open:
   **https://render.com/deploy?repo=https://github.com/abhay1298/cloudplay**
   This reads `render.yaml` from the repository.
3. When asked for **APP_PASSWORD**, type a strong password. You'll use it to sign in on your iPhone.
4. Click **Apply** or **Deploy**. The first build takes about 5–8 minutes.
5. When it says **Live**, copy your address from the top of the service page, e.g. `https://cloudplay-abcd.onrender.com`.
6. Open that address in a browser and sign in with your password to check that it works.

**Cost: free.** `render.yaml` uses Render's **Free** plan, and no credit card is needed. Limits of the free plan:
- It **sleeps after 15 minutes** without use. The next open takes about 1 minute; the app's "Try again" button handles it.
- **Saved library and history reset** when it sleeps or redeploys (there's no permanent disk on Free). Playback, conversion checks and the manual-transfer tools still work.

**To keep your data permanently (optional, paid):** in Render, change the plan to Starter (about $7/month) and add a **Disk** with mount path `/data`.

## Option 2: Your own server or VPS (Docker)

```bash
docker build -t cloudplay .
```
```bash
docker run -d --name cloudplay -p 3000:3000 -v cloudplay-data:/data -e APP_PASSWORD='choose-a-strong-password' --restart unless-stopped cloudplay
```
Then put HTTPS in front of it, for example with Caddy:
```
cloudplay.yourdomain.com {
  reverse_proxy 127.0.0.1:3000
}
```

## Then connect the iPhone

**Easiest: no .ipa needed.** Open your server address in Safari on the iPhone, sign in, then tap **Share → Add to Home Screen**.

**Or the .ipa app:**
1. GitHub → **Actions → Build iOS app (.ipa) → Run workflow**.
2. **server_url**: your exact address from step 5, e.g. `https://cloudplay-abcd.onrender.com`.
3. Download the `.ipa`, install it with Sideloadly (IOS_APP.md), open it, and sign in once. The app stays signed in for a year.

If you built the `.ipa` before the server existed, **build it again** with the real address. The address is fixed inside the app.

## Troubleshooting

| What you see in the app | Cause | Fix |
|---|---|---|
| "This build has no server address" | The `.ipa` was built without `server_url` | Re-run the workflow with your server address |
| "Can't reach your CloudPlay server" | Server not deployed, asleep (Free plan), wrong address, or no internet | Open the address in Safari first. If Safari can't load it either, fix the server. If Render Free, wait about 1 minute and tap Try again. |
| Sign-in page keeps coming back | Wrong password, or `APP_PASSWORD` was changed | Use the current `APP_PASSWORD` from Render → Environment |
| Diskwala or TeraBox link says playback isn't available | Expected: those services don't allow it (TECHNICAL_FEASIBILITY.md) | Use "Open in Diskwala/TeraBox" |
