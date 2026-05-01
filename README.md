# bvim

`bvim` is a CLI-launched line document editor for `.bvim` files. It opens a
small local desktop browser shell, lets you edit text lines with embedded image
and LaTeX items, and saves back to the file you opened with Vim-style commands.

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
bvim notes.bvim
bvim ~/Documents/notes.bvim
bvim -h
bvim -v
bvim -u
```

Running `bvim` with no file shows recent `.bvim` files and an option to create a
new document. There is no untitled scratch document.

In that flow, the document name is the filename. A path without a `.bvim`
suffix is treated as a directory, so `hello.bvim` plus `~/Documents/bvim`
creates `~/Documents/bvim/hello.bvim`.

Each `bvim <file>` command starts its own local server on the first available
port at or above `8000`, so multiple `.bvim` files can be open at the same time.

## Editing

- `n` opens the insert picker.
- `?` toggles the shortcut overlay.
- Text lines, image embeds, and LaTeX embeds are available from the picker.
- `j` and `k` move the active item in normal mode.
- `gg` and `G` jump to the first and last item.
- `J` and `K` move the selected item down and up.
- `i` or `Enter` edits the selected item.
- `Enter` inside a text line splits it into a new line.
- `yy` copies the selected item.
- `p` and `P` paste the copied item after or before the current item.
- `Esc` or `Ctrl+[` returns to normal mode.
- `:` opens the command line.
- `Ctrl+C` exits bvim entirely.
- `:w` saves the current file.
- `:w <name>` saves as another `.bvim` file in the current document directory.
- `:e <name>` opens another `.bvim` file in the current document directory.
- `:q` closes only when clean.
- `:q!` closes without saving.
- `:wq` saves and closes.
- `:lock` asks the browser shell for keyboard lock.

While typing in text fields, `Ctrl+M` acts as enter, `Ctrl+I` acts as tab, and
basic Emacs-style bindings such as `Alt+F`, `Alt+B`, `Ctrl+H`, `Ctrl+W`,
`Ctrl+A`, and `Ctrl+E` are handled by the editor.

## Files

Documents are JSON files with a `.bvim` suffix. The file still stores an ordered
`blocks` array for compatibility, but text entries are treated as document
lines. Image embeds store uploaded images as data URLs inside the document,
which keeps files portable but can make large image-heavy documents grow
quickly.

When launched from the CLI, the server restricts reads and writes to the opened
document directory and the app's internal `documents/` directory.

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
npm run cli -- notes.bvim
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
