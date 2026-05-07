# evim

`evim` is a CLI-launched Markdown previewer for local `.md` files. It opens a
small local desktop browser shell, renders Markdown with images and LaTeX, and
outsources editing to Vim in a terminal.

## Install

From a published GitHub release:

```bash
curl -fsSL https://raw.githubusercontent.com/ryangerardwilson/evim/main/install.sh | bash
```

From a source checkout:

```bash
npm install
ln -sfn "$PWD/evim" "$HOME/.local/bin/evim"
```

Make sure `~/.local/bin` is on your `PATH`.

## CLI

```bash
evim
evim notes.md
evim ~/Documents/notes.md
evim -h
evim -v
evim -u
```

Running `evim` with no file shows a `create or open` action followed by recent
`.md` files. There is no untitled scratch document.

If there are no recent files, `evim` starts directly on one path input. A path
without a `.md` suffix opens or creates the matching Markdown file. In the
recent-file screen, `j` and `k` move through `create or open` and all recent
files as one list. Path fields support `Tab` and `Ctrl+I` completions.

Each `evim <file>` command starts its own local server on the first available
port at or above `8000`, so multiple Markdown files can be open at the same
time.

## Preview

- `j` and `k` scroll the Markdown preview.
- Holding `j` or `k` stacks repeated scroll steps.
- `Ctrl+J` and `Ctrl+K` scroll half a page down or up, and repeat when held.
- `gg` and `G` scroll to the top and bottom.
- `i` toggles the heading index. In the index, `j` and `k` move through
  headings, and `Enter` or `l` jumps to the selected heading.
- `Enter` or `l` opens the current file in Vim in a terminal.
- `Esc` or `h` returns from the current file to the opening screen.
- External edits to the open Markdown file refresh automatically.
- `?` toggles the shortcut overlay.
- `Esc`, `h`, or `Ctrl+[` closes overlays or command mode.
- `:` opens the command line.
- `Ctrl+C` exits evim entirely.
- `:edit` opens the current file in Vim.
- `:38` opens the current file in Vim at line 38 and centers that line.
- `:e <name>` opens another `.md` file in the current document directory.
- `:! <command>` runs a Bash command with `~/.bashrc` sourced and shows the
  output in a fixed-height modal. In the output modal, `j` and `k` scroll.
- `:lock` asks the browser shell for keyboard lock.

Markdown image references such as `![caption](./image.png)` are resolved
relative to the Markdown file. Block LaTeX is rendered from `$$ ... $$`, and
inline LaTeX is rendered from `$...$`.

The Markdown page renders left aligned and full width. Display block LaTeX and
`evim-plot` blocks are slightly indented from text rows, and plots render at a
fixed 500px width.

Equation plots can be embedded with JavaScript-backed `evim-plot` code fences:

````md
```evim-plot
plot.func({
  x: [-6, 6],
  samples: 500,
  series: [
    { label: "sin(x)", y: x => sin(x), color: "cyan" },
    { label: "0.2x^2 - 1", y: x => 0.2 * x * x - 1, color: "#facc15" }
  ],
  title: "Equations"
})
```
````

The plot runtime is sandboxed and supports `plot.func`, `plot.points`,
`plot.coords`, `plot.parametric`, `plot.linspace`, and direct `Math` helpers
such as `sin`, `cos`, `PI`, and `sqrt`. Series can set `color`, `stroke`, or
`lineColor` with a safe named color, hex color, or `rgb(...)` value. Named
colors include `white`, `gray`, `red`, `orange`, `yellow`, `green`, `cyan`,
`blue`, `violet`, `purple`, and `pink`.

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
EVIM_TERMINAL=alacritty EVIM_EDITOR=nvim evim notes.md
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

## Docs Website

The public docs site lives in `docs_website/` and reads the checked-in README,
agent guide, and example Markdown file directly from this repo.

```bash
cd docs_website
npm install
npm run build
```

Production docs are deployed at:

```text
https://evim.ryangerardwilson.com
```

## Release

`evim` follows the local RGW CLI contract:

- `evim -h` prints help.
- `evim -v` prints the installed version.
- `evim -u` delegates to the installer upgrade path.
- `install.sh -h`, `install.sh -v`, `install.sh -v <version>`, `install.sh -u`,
  and `install.sh -b <archive.tar.gz>` are supported.

After the GitHub repository is configured, release and upgrade with:

```bash
./push_release_upgrade.sh
```

The script checks the tree, bumps the patch version from the latest remote tag,
runs tests and a production build, pushes the tag, creates a GitHub release, and
then upgrades the local install through `install.sh -u`.
