# Website logo: exact owner-specified head (no generative imagery)

The owner supplied: <http://minepic.org/head/234d0c6aad2846eab6f26431c391c10c>

The HTML logo uses the HTTPS MinePic isometric render for that **exact UUID**, at 256 pixels, and the favicon at 64 pixels. The prior AI-generated art has been removed from the application and the bundled PNG assets replaced with neutral `HS` text-only backup icons.

The browser also requests `/api/skin/234d0c6aad2846eab6f26431c391c10c` on startup. The Node endpoint accepts UUIDs or usernames, requests the actual skin texture from Mojang, and client-side canvas code assembles the head and second skin layer (hat) for a backup. The logo will not change when a visitor loads a different player skin. There is no AI image generation anywhere in this process.

**Internet access:** The exact head graphic requires that MinePic is reachable by the browser, or Mojang is reachable by the hosting server. If both are down, the website displays neutral `HS` lettering rather than the wrong player's skin. You can upload the owner's actual skin PNG as a future permanent offline fallback.

**Update:** Replace `index.html`, `src/app.js`, `server/index.mjs`, `logo.png`, `favicon.png`, and the documentation on GitHub. The GitHub Actions workflow automatically rebuilds your image; in Portainer use Re-pull image and redeploy.
