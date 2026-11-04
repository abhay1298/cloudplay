# Run CloudPlay on your own computer (free)

Your computer runs CloudPlay. **Tailscale** (free) gives it a permanent private `https://` address that your iPhone can reach from anywhere: home Wi-Fi, mobile data, anywhere. Only your own devices can open it.

**You need:** a Windows PC or Mac that stays on while you want to use CloudPlay, and your iPhone.

---

## Part A: Install CloudPlay on the computer (about 10 minutes, once)

1. **Install Node.js.** Go to https://nodejs.org, download the **LTS** version, and install it with the default options.
2. **Download CloudPlay.** Open https://github.com/abhay1298/cloudplay/archive/refs/heads/main.zip and unzip it. You get a folder `cloudplay-main`; put it somewhere permanent, e.g. Documents.
3. **Start it:**
   - **Windows:** double-click **`start-cloudplay.bat`** in the folder. If Windows shows "Windows protected your PC", click **More info → Run anyway**.
   - **Mac:** right-click **`start-cloudplay.command`** → **Open** → **Open**. If that's blocked, open **Terminal**, type `cd `, drag the folder into the window, press Enter, then type `node scripts/start.mjs` and press Enter.
4. **First run only:** it asks for:
   - a **password**: you'll type it on your iPhone to sign in. Remember it.
   - a **Tailscale address**: **press Enter to skip** for now. You'll add it in Part B.
5. Wait for installing and building (the first time takes about 3–5 minutes) until you see **"CloudPlay is starting"**.
6. Check it: open **http://localhost:3000** in a browser on the computer and sign in.

**Keep that window open** while you use CloudPlay. Closing it stops CloudPlay. Next time, double-click the start file again; it starts in seconds.

## Part B: Reach it from your iPhone with Tailscale (about 10 minutes, once)

**On the computer:**
1. Install Tailscale from https://tailscale.com/download and sign in (Google, Microsoft, Apple or GitHub account; free).
2. In your browser, open https://login.tailscale.com/admin/dns:
   - make sure **MagicDNS** is enabled
   - under **HTTPS Certificates**, click **Enable HTTPS**
3. Open a terminal (**Windows:** Start → type `cmd` → Enter. **Mac:** Terminal) and run:
   ```
   tailscale serve --bg 3000
   ```
   It prints your address, e.g. **`https://my-pc.tail1234.ts.net`**. Copy it. (On Mac, if `tailscale` isn't found, use the Tailscale menu-bar icon → Settings → install the CLI, or run `/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 3000`.)
4. Tell CloudPlay its address: close the CloudPlay window, then start it with setup:
   - **Windows:** open `cmd` in the CloudPlay folder and run `node scripts\start.mjs --setup`
   - **Mac:** in Terminal, in the folder, run `node scripts/start.mjs --setup`

   Enter your password again, then **paste the Tailscale address**.

**On the iPhone:**
5. Install **Tailscale** from the App Store, sign in with the **same account**, and turn it **ON** (it shows as a VPN).
6. Open Safari and go to your address (`https://my-pc.tail1234.ts.net`), then sign in.
7. Tap **Share → Add to Home Screen → Add**. CloudPlay is now an app on your iPhone. 🎉

## Part C (optional): The .ipa app instead of Home Screen

Send your Tailscale address to Claude, or put it in `native-config/server-url.txt` on GitHub. GitHub then builds the `.ipa` automatically and posts it at https://github.com/abhay1298/cloudplay/releases. Install it with Sideloadly (IOS_APP.md). The Home Screen version from step 7 does the same job without the 7-day re-signing.

---

## Everyday use
- The computer must be **on**, with the **CloudPlay window open**. Tailscale starts by itself.
- The iPhone needs **Tailscale ON**.
- Your library and history are saved on the computer in `data/cloudplay.db`. Copy that file to back them up.

## Updating CloudPlay later
Download the zip again, unzip it, and copy your old **`.env.local`** file and **`data`** folder into the new folder. Then start it as usual; it rebuilds automatically.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Node.js is not installed" | Install the LTS version from https://nodejs.org, then restart the computer |
| "Node.js 22.13 or newer is required" | Install the current LTS from nodejs.org |
| iPhone: page won't load | Is the computer on, the CloudPlay window open, and Tailscale ON on **both** devices? |
| iPhone: "Cross-origin request rejected" when saving | Run `start.mjs --setup` and paste the exact Tailscale address |
| Forgot password | Run `start.mjs --setup` and choose a new one |
| Want it to work without Tailscale on the phone | Run `tailscale funnel --bg 3000` instead of `serve`. **This makes CloudPlay public on the internet**; your password is then the only protection. |

Privacy: with `tailscale serve`, CloudPlay is reachable only by devices signed in to your Tailscale account. The server listens only on `127.0.0.1`, so other devices on your Wi-Fi can't reach it directly.
