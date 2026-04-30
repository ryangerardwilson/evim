# AGENTS.md

## Product

`bvim` is a CLI-launched local browser-based block editor with Vim-style
command saving. It is not a terminal TUI. Keep the main workflow keyboard-first
and preserve `bvim <file.bvim>`, `:w`, `:w <file>`, `:e <file>`, `:q`, `:q!`,
`:wq`, and normal-mode `n` for the block picker.
In text inputs and block editors, preserve `Ctrl+[` as escape, `Ctrl+M` as
enter, `Ctrl+I` as tab, and the local Emacs-style editing bindings.
Keep close-tab shortcut suppression for `Ctrl+W`/`Meta+W` so browser defaults
do not steal kill-word while the page has focus.
For Chromium, keep the explicit keyboard-lock control because real hardware
`Ctrl+W` can be reserved by the browser before normal page handlers run.
The reliable path for `Ctrl+W` is `npm run desktop`, which starts an Electron
shell and forwards the reserved shortcut to the renderer without browser tab
chrome closing the page.
No-arg `bvim` must create or open a named document through a document-name and
path flow before the editor opens. There should be no untitled scratch document
concept. `bvim -h` remains the fast static help path.

## Architecture

- `server.mjs` owns the local Express server and file API.
- `src/` owns the React editor.
- `bin/bvim.mjs` owns the CLI launcher.
- `electron/` owns the desktop shell used by the CLI.
- Documents use the `.bvim` suffix and contain plain JSON.
- `package.json` is the single checked-in version source for this Node app.
- `install.sh` and `push_release_upgrade.sh` own install/release plumbing.
- CLI-opened documents may live outside `documents/`, but the server must keep
  file access scoped to the opened document directory and the internal
  `documents/` directory. Do not turn the browser API into a general filesystem
  write endpoint.

## Interface

- Keep the app dense, quiet, and editor-like.
- Keep the visible editor chrome minimal; do not reintroduce side rails or the
  block metadata inspector unless the user explicitly asks for them.
- Keep primary actions keyboard-driven and keep `?` as the shortcut reference
  overlay.
- Keep text, image, and LaTeX block behavior first-class.
- Avoid turning the first screen into a landing page or documentation page.

## Dependencies

Use React, Vite, Express, KaTeX, and lucide-react for this version. Add new
dependencies only when they remove real implementation complexity.
