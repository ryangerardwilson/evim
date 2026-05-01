# AGENTS.md

## Product

`bvim` is a CLI-launched local browser-based Markdown previewer with Vim-backed
editing. It is not a terminal TUI. Keep the main workflow keyboard-first and
preserve `bvim <file.md>`, `:e <file>`, `:q`, `:q!`, `:wq`, `:edit`, `r`, and
normal-mode `i`/`Enter` opening the current Markdown file in Vim. Preserve
numeric commands such as `:38` opening the current Markdown file in Vim at that
line and centering it.
In setup and command inputs, preserve `Ctrl+[` as escape, `Ctrl+M` as enter,
`Ctrl+I` as tab, and the local Emacs-style editing bindings.
Keep close-tab shortcut suppression for `Ctrl+W`/`Meta+W` so browser defaults
do not steal kill-word while the page has focus.
For Chromium, keep the explicit keyboard-lock control because real hardware
`Ctrl+W` can be reserved by the browser before normal page handlers run.
The reliable path for `Ctrl+W` is `npm run desktop`, which starts an Electron
shell and forwards the reserved shortcut to the renderer without browser tab
chrome closing the page.
No-arg `bvim` must show recent `.md` files and an option to create a named
document through a document-name and path flow before the preview opens. There
should be no untitled scratch document concept. `bvim -h` remains the fast
static help path.

## Architecture

- `server.mjs` owns the local Express server, Markdown file API, relative asset
  serving, and terminal editor launch endpoint.
- `src/` owns the React Markdown preview.
- `bin/bvim.mjs` owns the CLI launcher.
- `electron/` owns the desktop shell used by the CLI.
- Documents use the `.md` suffix and contain plain Markdown.
- `package.json` is the single checked-in version source for this Node app.
- `install.sh` and `push_release_upgrade.sh` own install/release plumbing.
- CLI-opened documents may live outside `documents/`, but the server must keep
  file and asset access scoped to the opened document directory and the internal
  `documents/` directory. Do not turn the browser API into a general filesystem
  endpoint.

## Interface

- Keep the app dense, quiet, and reader-like.
- Keep the visible editor chrome minimal; do not reintroduce side rails,
  inspectors, or in-browser editing unless the user explicitly asks.
- Keep primary actions keyboard-driven and keep `?` as the shortcut reference
  overlay.
- Keep `j` and `k` as smooth scroll controls, not item navigation.
- Keep the bvim app background transparent in both CSS and Electron. Visible UI
  surfaces should be translucent black or grayscale only.
- Do not introduce colored UI accents. The palette is black, white, and gray.
- Keep Markdown, image references, and LaTeX rendering first-class.
- Avoid turning the first screen into a landing page or documentation page.

## Dependencies

Use React, Vite, Express, KaTeX, and lucide-react for this version. Add new
dependencies only when they remove real implementation complexity.
