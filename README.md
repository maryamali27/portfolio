# Maryam Ali — Portfolio (final)

This repository contains a polished, animated, professional portfolio site for Maryam Ali. It loads project metadata from `projects.json`. A helper script `generate_projects.js` will fetch all public repositories for a GitHub username and populate `projects.json` with languages, stars, forks, README excerpt, contributors, topics, license, thumbnail and more.

Your email is set to: m3ryamali27@gmail.com

What to do
1. Install Node.js (v18+ recommended).
2. Put these files in this repository (or create a new repository named `maryamali27.github.io` to deploy to Pages) and push.
3. To auto-populate `projects.json` for your account run:
   - node generate_projects.js --username maryamali27 --token YOUR_GITHUB_TOKEN
   - If you don't have a token you can omit `--token`, but unauthenticated requests are rate-limited.
4. Preview locally: open `index.html` in a browser (some features like fetch may require a simple static server — see below).
5. Commit and push to your GitHub repo and enable GitHub Pages (branch: main, folder: root).

Static server (optional)
- For local testing some APIs and Chart.js render fine opening index.html directly, but if you run into CORS or fetch issues, start a simple server:
  - Python: python -m http.server 8000
  - Node: npx serve . (install serve globally if you prefer)

Security note
- The generator script uses your token locally if provided. It does not transmit it anywhere else.

If you want, after you run the generator and push the repo, paste the repo URL here and I will review the produced `projects.json` and suggest layout tweaks or polish text for each project.