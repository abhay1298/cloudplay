# Native app configuration

`server-url.txt` holds the HTTPS address of your CloudPlay server, e.g.

    https://cloudplay-abcd.onrender.com

Committing a change to it (or to the iOS project) automatically builds a new
`.ipa` with GitHub Actions and publishes it on the repository's **Releases** page.
Leave it empty to skip automatic builds.

Note: in a public repository this address is visible to anyone. Keep `APP_PASSWORD`
set on the server so only you can use it.
