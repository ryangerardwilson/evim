# bvim

`bvim` is a CLI-launched block document editor for `.bvim` files. It opens a
small local desktop browser shell, lets you edit text, image, and LaTeX blocks,
and saves back to the file you opened with Vim-style commands.

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

Running `bvim` with no file starts a new-document flow. In a terminal, it asks
for the document name and path before opening the editor. From a desktop
launcher, such as Hyprland, the same name and path flow opens inside the app.
There is no untitled scratch document.

In that flow, the document name is the filename. A path without a `.bvim`
suffix is treated as a directory, so `hello.bvim` plus `~/Documents/bvim`
creates `~/Documents/bvim/hello.bvim`.

Each `bvim <file>` command starts its own local server on the first available
port at or above `8000`, so multiple `.bvim` files can be open at the same time.

## Editing

- `n` opens the block picker.
- `?` toggles the shortcut overlay.
- Text, image, and LaTeX blocks are available from the picker.
- `j` and `k` move the active block in normal mode.
- `J` and `K` move the selected block down and up.
- `i` or `Enter` edits the selected block.
- `Esc` or `Ctrl+[` returns to normal mode.
- `:` opens the command line.
- `Ctrl+Q` exits bvim entirely.
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

Documents are JSON files with a `.bvim` suffix. Image blocks store uploaded
images as data URLs inside the document, which keeps files portable but can make
large image-heavy documents grow quickly.

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
