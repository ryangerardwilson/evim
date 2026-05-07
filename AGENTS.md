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
- `Enter` or `l` opens the current Markdown file in Vim.
- `Esc` or `h` returns from the current Markdown file to the opening screen.
- `:edit` opens the current Markdown file in Vim.
- `:e <file>` opens another `.md` file in the current document directory.
- `:! <command>` runs a Bash command with `~/.bashrc` sourced and shows the
  output in evim.
- `:38` opens the current Markdown file in Vim at line 38 and centers it.
- `i` toggles the heading index popup.
- `?` toggles the shortcut reference overlay.
- `Ctrl+C` exits evim.

Do not reintroduce `:q`, `:q!`, `:w`, `:wq`, or `:x` inside evim. Vim owns
persistence and quitting while editing.

External disk changes to the current Markdown file refresh automatically. Do
not add manual reload commands unless the user explicitly asks for them.

Shell command output should open in a centered fixed-height modal. Its output
body owns scrolling, hides scrollbars, and scrolls with `j` and `k`.

## No-Arg Flow

There must be no untitled scratch document concept.

When launched as `evim`, the app must show:

- a `create or open` action for entering a `.md` path
- recent `.md` files below it

When there are no recent documents, the setup screen should show a single path
input that opens an existing Markdown file or creates it if it does not exist.
When recent documents exist, `j` and `k` must move through the `create or open`
action and all recent files as one selectable list.

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
- `Esc` and `h` leave the current file and return to the opening screen.
- `Enter` and `l` open the current file in Vim.
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

The Markdown page should render left aligned and full width. Do not reintroduce
a centered reading column. Display block LaTeX and `evim-plot` blocks with a
slight indentation from text rows. Plots render at a fixed 500px width; text
wrapping is controlled by the author's source line breaks.

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
