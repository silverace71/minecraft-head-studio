# Minecraft Head Studio

**Self-hosted pixel-to-foamboard head designer** · GPL-3.0-or-later · prototype v0.2.1

Convert a Minecraft Java player's head skin or a local PNG into editable panels, add extended material layers and sliders, preview in 2D/3D, and export cutting/coloring/gluing instructions. No accounts, analytics, third-party JavaScript CDNs, build toolchains, or external JavaScript dependencies. The header head image references MinePic and a Mojang-based fallback; visitors may contact MinePic to fetch the head.

> **Prototype, not production engineering documentation.** Use scrap materials to test all joints and movement. Do not rely on the preview for wearer safety or motor control.

## Features available now

- **Skin lookup:** username → Mojang/Minecraft Services UUID → session server profile → texture PNG, through a same-origin Node API. Also upload 64×64, legacy 64×32, and HD Minecraft skin PNGs up to 1024×1024.
- **Correct head UV mapping:** extract all six faces from the native base and hat overlay, including per-pixel transparency.
- **Resolution:** 8×8, 16×16, 32×32 and 64×64 *per head face*, nearest-neighbor scaling of imported skins and existing designs.
- **Layer stack:** fixed undeletable base and hat, additional outer layers with adjustable distances, internal backing layers, visibility toggles, renaming, reordering within a layer type, safe delete confirmation, physical offset and pixel-size telemetry.
- **Extended shapes:** adjacent pixel placement only **outside** the original head face. Grid can be toggled, but painting extensions still enforces adjacency.
- **Materials:** solid pixels, translucent/mesh hatching, eraser, color picker and edge paint/tape.
- **2D canvas** editor for all six head faces, and interactive **double-sided canvas 3D projection** with drag orbit/zoom and a toggleable 3D grid; no GPU dependency.
- **Motion:** rectangular moving pixel groups, X/Y travel, adjustable channel clearance, simulated displacement, elastic/gravity/manual return instructions, and painter-created behind/in-front patch layers.
- **Special pupil mode:** two eye regions 2×3 *native* Minecraft pixels, pupils 1×2 pixels, 4-corner or 2-top-corner cable geometry and a position preview. **No motor control implemented.**
- **Exports:** local project JSON with full editing state, per-face SVG patterns in millimeters, and printable, illustrated multi-step build-guide HTML (print to PDF in browser). The SVG layout is a planning template; validate actual-scale print and kerf/miter geometry with the material.
- **Autosave:** local browser storage; no account required. Export JSON backups when switching browsers/devices or before large changes.

### Limitation to understand

The canvas-based 3D preview displays editable planar head faces with stand-off layers, not solid mesh geometry or a mechanically validated CAD model. Moving pixels are visualized but do not perform collision detection. Additional hair/tiles may need hidden foamboard struts that the preview doesn't design automatically. Mesh is a material annotation. The cut drawings are color and dimensional plans; they do not automatically nest parts onto Dollar Tree foamboard sheets or calculate exact blade kerf. The guide recommends testing 45° miters; it does not solve every corner joint geometry. The eye plotter computes theoretical string lengths but not force, pulleys, calibration, electronics, or firmware. Hardware features are future roadmap items.

## Run locally

Requires **Node.js 20+**. No `npm install` is needed.

```bash
npm start
# open http://localhost:8080
npm test
```

## Docker / Portainer — easiest routes

### Option A: Docker Compose from a local checkout (no image registry)

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/minecraft-head-studio.git
cd minecraft-head-studio
docker compose up --build -d
# http://YOUR_SERVER_IP:3000
```

You can also use Portainer **Stacks → Add stack → Repository**, point it at your own repository, and use `docker-compose.yml` when your Docker standalone Portainer environment supports building the image from the Git checkout. Build-from-Git support depends on your Portainer/Docker setup; if it cannot build locally, use Option B.

### Option B: Portainer web editor, GitHub Actions image (recommended for simple updates)

1. Create your GitHub repository and push this source code (instructions below).
2. Under GitHub **Actions**, enable the included `Publish Docker image` workflow. On `main` it builds and publishes `ghcr.io/YOUR_GITHUB_USERNAME/minecraft-head-studio:latest`.
3. In your GitHub package settings, grant **public** access to the container image if your Portainer cannot authenticate to GHCR. The repository being public does not always make the package public automatically.
4. Use the included `portainer-stack.yml`; it already names `silverace71`. Change only the **left** host port in `3000:8080` if you need another port.
5. Portainer → **Stacks** → **Add stack** → **Web editor**. Paste the edited contents and click **Deploy the stack**.
6. Open `http://YOUR_SERVER_IP:3000` (or the host port you selected). For internet exposure, use a trusted HTTPS reverse proxy, set access controls/firewall rules, and keep the host patched.
7. To receive updates, push a new commit, wait for the container image to publish, then **Pull and redeploy** your Portainer stack.

No database or persistent Docker volume is needed: design data is stored in **each visitor's browser**. To share projects with friends, exchange project `.headstudio.json` files; there is no multi-user collaboration server.

## Create your GitHub repository

If you have GitHub CLI `gh` installed and authenticated:

```bash
# From the extracted folder
cd minecraft-head-studio
# Already has a Git initial commit if you use the supplied .bundle; otherwise:
git init -b main
git add .
git commit -m "Initial GPL Minecraft Head Studio prototype"
gh repo create minecraft-head-studio --public --source=. --remote=origin --push
```

Or create an empty `minecraft-head-studio` repository on github.com (without auto-generating a README), then:

```bash
git init -b main
git add .
git commit -m "Initial studio"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/minecraft-head-studio.git
git push -u origin main
```

A `minecraft-head-studio.git.bundle` is also provided separately so you can clone the initial git history via `git clone <bundle-name> minecraft-head-studio`.

## First-use walkthrough

1. Open the demo head, import a skin using a Java username or drag/drop a PNG.
2. Select a head face, paint/erase pixels, and select a layer on the right. Check the 3D rotation and grid.
3. Open the left tool drawer for **Physical setup** to adjust head dimensions/resolution, then use **Layers** on the right to add an extra outer layer. Click cells immediately beyond a colored cell to grow hair outside the normal head rectangle. Set layer gap and watch pixel pitch change.
4. For sliding eyes or other parts, select the source layer, choose the square selection tool, drag a rectangular region inside the head's face, open **Motion & eyes** in the left drawer and create a slider. Enter X/Y travel and clearance. Drag preview or play the motion.
5. Add an **internal backing** layer and paint behind the opening; use an **outer** layer for a front masking strip. Since each layer can hold pixels on each side, you control what is hidden/revealed.
6. For the plotter, use **Motion & eyes → 2×3 eye plotter**, enable and configure eye origin(s) in the original 8×8 pixel coordinate system. 2×3 windows and 1×2 pupils automatically scale when resolution is increased.
7. Export your project JSON, selected-face SVG and illustrated HTML guide. Open the guide locally and click **Print / Save as PDF**.

## Security and privacy

- Username lookup is performed by the app's Node server against Mojang/Minecraft Services; no user-submitted arbitrary texture URLs are fetched.
- The app limits remote lookup requests per client IP and restricts texture downloads to `textures.minecraft.net`, using TLS.
- Browser storage holds uploaded pixel designs locally; the server keeps only a short-lived memory cache of Mojang skin requests. No telemetry, upload storage, cookies, authentication or remote user accounts.
- If publishing publicly, put it behind HTTPS, optionally authentication and external rate-limiting. Avoid giving the internet direct access to Portainer administration.

## Contributing / roadmap

Ideas for future releases: motor drivers and firmware, accelerometer/head tracking, LEDs, collision checking, printable true-size tiling, detailed foamboard sheet nesting and waste estimates, channels and strut generation, real plotter dynamics, STL/CAD, workspace sharing, automatic fixture dimensions, and head safety/airflow assessment.

See [`CONTRIBUTING.md`](CONTRIBUTING.md). License: **GNU GPL version 3 or any later version**, see [`LICENSE`](LICENSE). Do not imply affiliation with Mojang Studios, Minecraft or Microsoft. Respect third-party skin artists when distributing designs.

Reference: [Minecraft Wiki — Mojang API](https://minecraft.wiki/w/Mojang_API) · [Minecraft head skin UV mapping](https://skinrender.dev/minecraft-head-render/) · [Portainer Stacks](https://docs.portainer.io/user/docker/stacks/add)

---

## Version 0.2 — Editor redesign and interoperability

This release preserves your v0.1 JSON project format and local browser save key. It adds a collapsed tool rail and advanced left drawer; color, layer visibility, layer offsets, and deletion controls on the right; a stronger 2D placement grid and toggleable, double-sided 3D wireframe rendered in a single canvas (no flickering CSS 3D transforms); color HEX field and swatches; optional symmetrical, depth-defined ears; PNG/JSON face templates (stored in browser memory only); and **experimental Blockbench 5.x `.bbmodel` export** and Head Studio re-import. The exported model contains texture atlases and editable layer/ear cubes. Movements/extensions are preserved in an embedded project payload, not converted into mechanical Blockbench constraints. Editing the model in Blockbench does **not** update that payload automatically.

The website logo uses the owner-provided MinePic isometric head image keyed to UUID `234d0c6aad2846eab6f26431c391c10c` (not a username). The favicon uses the same exact head. If MinePic fails, the app attempts to render that UUID’s raw Mojang skin locally; if both are unavailable, the bundled assets contain only neutral `HS` typography, **not an AI-generated head**. Live branding requires the browser or server to reach MinePic/Mojang. To bundle the exact head for offline use, supply the PNG download of that skin. See [UPDATE-GITHUB.md](UPDATE-GITHUB.md) for how to update GitHub entirely in the browser and re-pull the container in Portainer.

For a Portainer web-editor deployment, the sample `portainer-stack.yml` uses `ghcr.io/silverace71/minecraft-head-studio:latest` with **host port 3000 → container port 8080**. Keep your currently configured host port if you prefer a different number; you do not need to rebuild the app just to change it. For local Docker Compose, `HEAD_STUDIO_PORT=3000` is the new default.
