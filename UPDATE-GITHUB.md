# Updating Head Studio on GitHub and Portainer — v0.2

Repo: <https://github.com/silverace71/minecraft-head-studio>
Container: `ghcr.io/silverace71/minecraft-head-studio:latest`

## Before replacing source code

1. Open your running website and **Save JSON** for designs you care about. v0.2 keeps the `minecraft-head-studio:v1` browser autosave key, but a manual backup is safer.
2. Download and unzip `minecraft-head-studio-v02-update.zip`. It contains files that changed between the original v0.1 source ZIP and this release.
3. Keep the folder structure: `server/index.mjs`, `src/*.js`, `src/studio-v02.css`, etc. Do not nest the update folder itself inside the GitHub repository.

## Website-only method: github.dev

1. Open <https://github.com/silverace71/minecraft-head-studio> while logged in.
2. Press the `.` (period) key. GitHub opens VS Code for the Web at `github.dev`.
3. In Explorer (left side), drag files from the extracted update ZIP into the matching existing repository folders. If a replacement is requested, choose **Replace/Overwrite**. `index.html`, `Dockerfile`, `README.md`, and the new PNG assets go at the repository root. Copy contents of `src` into `src`, and `server/index.mjs` into `server`.
4. Verify the changes appear in Source Control (branch icon). Commit to `main` with message `Head Studio v0.2 — editor and renderer refresh`; push/sync if requested.
5. Go back to github.com → **Actions** → **Publish Docker image** (or **Build and Publish Docker Image** if you used the other workflow). Wait for the workflow to finish with a green check.
6. In Portainer → **Stacks** → `minecraft-head-studio` → **Editor** → **Update the stack**, and enable **Re-pull image and redeploy** when offered. Your existing host port mapping can stay exactly as it is.
7. Reload the website. If it appears unchanged, hard refresh with Ctrl+Shift+R. Use `/api/health` to check server `version: 0.2.0`.

The web UI does not publish containers directly. GitHub Actions builds and pushes an image to GHCR, then Portainer runs it. Browser edits do not affect the live container until you redeploy it.

**Portainer Git stack**: if the stack is Git-managed, use **Pull and redeploy**, with **Re-pull image** enabled, instead of an Editor button.

## Terminal fallback (if browser upload does not support overwrite)

On a computer with Git installed:

```sh
git clone https://github.com/silverace71/minecraft-head-studio.git
cd minecraft-head-studio
```

Copy the **contents** of the extracted v0.2 update ZIP into that checkout, replacing matching files but leaving other files intact. Then:

```sh
git add -A
git commit -m "Head Studio v0.2 editor and renderer refresh"
git push origin main
```

Check the green GitHub Actions build, then update Portainer as above.

## Updating the website in future

Edit any file on GitHub (or in github.dev), commit to `main`, check Actions, and re-pull in Portainer. `:latest` is not guaranteed to update an already-running container by itself.

## Notes

- The project is self-hosted. Neither skins nor templates are uploaded into a shared database.
- Imported PNG templates are held in browser memory only until stamped into a layer. Face template JSON is a compact pixel map.
- Blockbench `.bbmodel` export is a geometry/texturing interchange. Re-import works with files exported by this app using their embedded `headstudio_project`; third-party or subsequently edited Blockbench geometry is not merged back automatically.
- The logo and favicon now point to the owner-supplied MinePic image at `https://minepic.org/head/234d0c6aad2846eab6f26431c391c10c`, and the app can render a fallback directly from the SAME UUID’s Mojang skin. No generated illustration remains in the website; neutral `HS` lettering is the offline fallback.
- This is a prototype. Physical fabrication dimensions and mechanical tolerances need to be tested before making wearable pieces.
