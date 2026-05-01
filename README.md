# bvim

`bvim` is a CLI-launched Markdown previewer for local `.md` files. It opens a
small local desktop browser shell, renders Markdown with images and LaTeX, and
outsources editing to Vim in a terminal.

## Install

From a published GitHub release:

```bash
curl -fsSL https://raw.githubusercontent.com/ryangerardwilson/bvim/main/install.sh | bash
```

From a source checkout:

```bash
npm install
ln -sfn "$PWD/bvim" "$HOME/.local/bin/bvim"
```

Make sure `~/.local/bin` is on your `PATH`.

## CLI

```bash
bvim
bvim notes.md
bvim ~/Documents/notes.md
bvim -h
bvim -v
bvim -u
```

Running `bvim` with no file shows recent `.md` files and an option to create a
named Markdown document. There is no untitled scratch document.

In that flow, the document name is the filename. A path without a `.md` suffix
is treated as a directory, so `hello.md` plus `~/Documents/bvim` creates
`~/Documents/bvim/hello.md`.

Each `bvim <file>` command starts its own local server on the first available
port at or above `8000`, so multiple Markdown files can be open at the same
time.

## Preview

- `j` and `k` smooth-scroll the Markdown preview.
- `gg` and `G` scroll to the top and bottom.
- `i` or `Enter` opens the current file in Vim in a terminal.
- `r` reloads the Markdown from disk.
- `?` toggles the shortcut overlay.
- `Esc` or `Ctrl+[` closes overlays or command mode.
- `:` opens the command line.
- `Ctrl+C` exits bvim entirely.
- `:edit` opens the current file in Vim.
- `:e <name>` opens another `.md` file in the current document directory.
- `:r` or `:w` reloads from disk.
- `:q`, `:q!`, or `:wq` closes bvim.
- `:lock` asks the browser shell for keyboard lock.

Markdown image references such as `![caption](./image.png)` are resolved
relative to the Markdown file. Block LaTeX is rendered from `$$ ... $$`, and
inline LaTeX is rendered from `$...$`.

While typing in setup or command fields, `Ctrl+M` acts as enter, `Ctrl+I` acts
as tab, and basic Emacs-style bindings such as `Alt+F`, `Alt+B`, `Ctrl+H`,
`Ctrl+W`, `Ctrl+A`, and `Ctrl+E` are handled by the editor.

## Files

Documents are plain Markdown files with a `.md` suffix. There is no JSON
document format.

When launched from the CLI, the server restricts reads and writes to the opened
document directory and the app's internal `documents/` directory.

To choose a terminal or editor explicitly:

```bash
BVIM_TERMINAL=alacritty BVIM_EDITOR=nvim bvim notes.md
```

## Development

```bash
npm install
npm run dev
```

The development server runs at:

```text
http://localhost:8000
```

The plain web server opens the same name and path flow when no file is supplied.
The CLI is the normal path for opening a specific document:

```bash
npm run cli -- notes.md
```

Run the desktop shell directly when debugging Electron behavior:

```bash
npm run desktop
```

## Release

`bvim` follows the local RGW CLI contract:

- `bvim -h` prints help.
- `bvim -v` prints the installed version.
- `bvim -u` delegates to the installer upgrade path.
- `install.sh -h`, `install.sh -v`, `install.sh -v <version>`, `install.sh -u`,
  and `install.sh -b <archive.tar.gz>` are supported.

After the GitHub repository is configured, release and upgrade with:

```bash
./push_release_upgrade.sh
```

The script checks the tree, bumps the patch version from the latest remote tag,
runs tests and a production build, pushes the tag, creates a GitHub release, and
then upgrades the local install through `install.sh -u`.
