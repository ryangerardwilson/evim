# AGENTS.md

## Product

`evim` is a CLI-launched local browser-based Markdown previewer with
Vim-backed editing.

It is not a terminal TUI. Keep the app reader-like, keyboard-first, and centered
on plain `.md` files.

## Core Workflow

Preserve these entrypoints and editor actions:

- `evim <file.md>` opens a Markdown file in the local preview shell.
- `evim` with no file shows recent `.md` files plus document creation and file
  open flows.
- `Enter` opens the current Markdown file in Vim.
- `:edit` opens the current Markdown file in Vim.
- `:e <file>` opens another `.md` file in the current document directory.
- `:38` opens the current Markdown file in Vim at line 38 and centers it.
- `r` reloads from disk.
- `i` toggles the heading index popup.
- `?` toggles the shortcut reference overlay.
- `Ctrl+C` exits evim.

Do not reintroduce `:q`, `:q!`, `:w`, `:wq`, or `:x` inside evim. Vim owns
persistence and quitting while editing.

## No-Arg Flow

There must be no untitled scratch document concept.

When launched as `evim`, the app must show:

- recent `.md` files
- an option to create a named document
- an option to open an existing `.md` file by path

The new-document flow must collect a document name and path before opening the
preview.

## Keyboard Input

In setup and command inputs, preserve:

- `Ctrl+[` as escape
- `Ctrl+M` as enter
- `Ctrl+I` as tab
- local Emacs-style editing bindings such as `Alt+F`, `Alt+B`, `Ctrl+H`,
  `Ctrl+W`, `Ctrl+A`, and `Ctrl+E`

Keep close-tab shortcut suppression for `Ctrl+W` and `Meta+W` so browser chrome
does not steal kill-word while the page has focus.

For Chromium, keep the explicit keyboard-lock control. Real hardware `Ctrl+W`
can be reserved by the browser before normal page handlers run.

The reliable path for `Ctrl+W` is `npm run desktop`, which starts an Electron
shell and forwards the reserved shortcut to the renderer without browser tab
chrome closing the page.

## Navigation

Keep document navigation immediate, not smooth-scrolling:

- `j` and `k` scroll the preview.
- Held `j` and `k` stack repeated immediate scroll steps.
- `Ctrl+J` and `Ctrl+K` scroll half a page.
- Held `Ctrl+J` and `Ctrl+K` stack repeated immediate half-page scrolls.

Do not turn `j` and `k` into item navigation in the main preview.

## Architecture

- `server.mjs` owns the local Express server, Markdown file API, relative asset
  serving, and terminal editor launch endpoint.
- `src/` owns the React Markdown preview.
- `bin/evim.mjs` owns the CLI launcher.
- `electron/` owns the desktop shell used by the CLI.
- `package.json` is the single checked-in version source for this Node app.
- `install.sh` and `push_release_upgrade.sh` own install and release plumbing.

CLI-opened documents may live outside `documents/`, but server access must stay
scoped to:

- the opened document directory
- the internal `documents/` directory

Do not turn the browser API into a general filesystem endpoint.

## Rendering

Documents use the `.md` suffix and contain plain Markdown.

Keep these rendering features first-class:

- Markdown text and headings
- source line numbers, including blank lines
- relative image references
- block LaTeX
- inline LaTeX
- `evim-plot` fenced plot blocks

The shared `evim/markdown` package is the source of truth for Markdown parsing
used by evim and by public notes sites.

## Interface

- Keep the app dense, quiet, and reader-like.
- Keep visible editor chrome minimal.
- Keep primary actions keyboard-driven.
- Keep the Electron window transparent.
- Keep the page background translucent black, matching the active terminal
  opacity.
- Keep visible UI surfaces translucent black or grayscale only.
- Do not introduce colored UI accents.
- Do not reintroduce side rails, inspectors, or in-browser editing unless the
  user explicitly asks.
- Do not turn the first screen into a landing page or documentation page.

The app chrome palette is black, white, and gray. User-authored plot series may
opt into line colors as document content.

## Dependencies

Use React, Vite, Express, KaTeX, and lucide-react for this version.

Add dependencies only when they remove real implementation complexity.
