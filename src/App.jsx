import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import {
  headingIndexFromNodes,
  inlineParts,
  leftAlignedLatexRows,
  parseMarkdown,
  plotFrameSource,
  renderPlotSvg
} from "@ryangerardwilson/bvim-markdown";
import { resolveNamedDocumentPath } from "./documentPaths.js";

function initialFileName() {
  const params = new URLSearchParams(window.location.search);
  return params.get("file") || "";
}

const START_FILE = initialFileName();
const SHORTCUT_GROUPS = [
  {
    title: "normal",
    items: [
      ["?", "toggle shortcuts"],
      ["j / k", "scroll down / up"],
      ["ctrl+j / ctrl+k", "half page down / up"],
      ["gg / G", "scroll top / bottom"],
      ["i", "toggle heading index"],
      ["enter", "open file in vim"],
      [":38", "open line 38 in vim"],
      ["r", "reload markdown"],
      [":", "command line"],
      ["ctrl+c", "quit bvim"]
    ]
  },
  {
    title: "commands",
    items: [
      [":e path", "open markdown path"],
      [":edit", "open current file in vim"],
      [":index", "toggle heading index"],
      [":38", "open current file at line 38"],
      [":r", "reload current file"],
      [":lock", "request keyboard lock"]
    ]
  },
  {
    title: "setup",
    items: [
      ["n", "new document"],
      ["o", "open markdown path"],
      ["j / k", "move recent selection"],
      ["enter", "open selected recent"],
      ["esc / ctrl+[", "back"]
    ]
  },
  {
    title: "typing",
    items: [
      ["esc / ctrl+[", "normal mode"],
      ["ctrl+m", "enter"],
      ["ctrl+i", "tab"],
      ["alt+f / alt+b", "word forward / back"],
      ["ctrl+a / ctrl+e", "line start / end"],
      ["ctrl+h / ctrl+d", "delete back / forward"],
      ["ctrl+w / alt+d", "kill word back / forward"],
      ["ctrl+k / ctrl+u", "kill line right / left"],
      ["ctrl+y", "yank killed text"]
    ]
  }
];
const KEYBOARD_LOCK_KEYS = [
  "Backspace",
  "BracketLeft",
  "Enter",
  "KeyA",
  "KeyB",
  "KeyC",
  "KeyD",
  "KeyE",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyM",
  "KeyR",
  "KeyU",
  "KeyW",
  "Tab"
];
let killRing = "";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function renderLatex(source, displayMode = true) {
  try {
    return katex.renderToString(source || "", {
      displayMode,
      throwOnError: false,
      strict: false
    });
  } catch (error) {
    return `<span class="latex-error">${error.message}</span>`;
  }
}

function keyName(event) {
  if (event.key.length === 1) {
    return event.key.toLowerCase();
  }
  if (event.code?.startsWith("Key")) {
    return event.code.slice(3).toLowerCase();
  }
  return event.key;
}

function isEscapeKey(event) {
  const key = keyName(event);
  return (
    event.key === "Escape" ||
    key === "Escape" ||
    (event.ctrlKey && !event.altKey && !event.metaKey && (key === "[" || event.code === "BracketLeft"))
  );
}

function isEnterKey(event) {
  const key = keyName(event);
  return (
    event.key === "Enter" ||
    key === "Enter" ||
    (event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      (key === "m" || event.code === "KeyM"))
  );
}

function isCloseTabShortcut(event) {
  const key = keyName(event);
  return (event.ctrlKey || event.metaKey) && !event.altKey && key === "w";
}

function isWordChar(character) {
  return /[A-Za-z0-9_]/.test(character);
}

function previousWordIndex(value, position) {
  let index = position;
  while (index > 0 && !isWordChar(value[index - 1])) {
    index -= 1;
  }
  while (index > 0 && isWordChar(value[index - 1])) {
    index -= 1;
  }
  return index;
}

function nextWordIndex(value, position) {
  let index = position;
  while (index < value.length && !isWordChar(value[index])) {
    index += 1;
  }
  while (index < value.length && isWordChar(value[index])) {
    index += 1;
  }
  return index;
}

function lineStartIndex(value, position) {
  return value.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
}

function lineEndIndex(value, position) {
  const nextBreak = value.indexOf("\n", position);
  return nextBreak === -1 ? value.length : nextBreak;
}

function previousLineIndex(value, position) {
  const currentStart = lineStartIndex(value, position);
  if (currentStart === 0) {
    return 0;
  }
  const previousEnd = currentStart - 1;
  const previousStart = lineStartIndex(value, previousEnd);
  const column = position - currentStart;
  return Math.min(previousStart + column, previousEnd);
}

function nextLineIndex(value, position) {
  const currentStart = lineStartIndex(value, position);
  const currentEnd = lineEndIndex(value, position);
  if (currentEnd >= value.length) {
    return value.length;
  }
  const nextStart = currentEnd + 1;
  const nextEnd = lineEndIndex(value, nextStart);
  const column = position - currentStart;
  return Math.min(nextStart + column, nextEnd);
}

function placeCaret(target, start, end = start) {
  window.requestAnimationFrame(() => {
    target.focus();
    target.setSelectionRange(start, end);
  });
}

function longestCommonPrefix(values) {
  if (!values.length) {
    return "";
  }
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function documentScrollStep(node) {
  return Math.max(96, node.clientHeight * 0.32);
}

function setScrollMeterProgress(target, progress) {
  if (!target) {
    return;
  }
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 1));
  target.style.transform = `scaleX(${clamped.toFixed(4)})`;
}

function commitTextValue(target, setValue, nextValue, start, end = start) {
  setValue(nextValue);
  placeCaret(target, start, end);
}

function handleTextControlKeyDown(event, { setValue, multiline = false, onEnter, onEscape } = {}) {
  const target = event.currentTarget;
  if (!target || typeof target.value !== "string" || typeof target.setSelectionRange !== "function") {
    return false;
  }

  const value = target.value;
  const start = target.selectionStart ?? value.length;
  const end = target.selectionEnd ?? start;
  const key = keyName(event);
  const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
  const alt = event.altKey && !event.ctrlKey && !event.metaKey;

  const replaceRange = (from, to, text, killedText = "") => {
    if (killedText) {
      killRing = killedText;
    }
    const nextValue = `${value.slice(0, from)}${text}${value.slice(to)}`;
    const nextPosition = from + text.length;
    commitTextValue(target, setValue, nextValue, nextPosition);
  };

  const moveCaret = (position) => {
    const nextPosition = Math.max(0, Math.min(value.length, position));
    placeCaret(target, nextPosition);
  };

  if (isEscapeKey(event) && onEscape) {
    event.preventDefault();
    onEscape();
    return true;
  }

  if (key === "Tab" || (ctrl && key === "i")) {
    event.preventDefault();
    replaceRange(start, end, "\t");
    return true;
  }

  if (isEnterKey(event)) {
    event.preventDefault();
    if (multiline) {
      replaceRange(start, end, "\n");
    } else if (onEnter) {
      onEnter(value);
    }
    return true;
  }

  if (ctrl && key === "a") {
    event.preventDefault();
    moveCaret(lineStartIndex(value, start));
    return true;
  }

  if (ctrl && key === "e") {
    event.preventDefault();
    moveCaret(lineEndIndex(value, start));
    return true;
  }

  if (ctrl && key === "b") {
    event.preventDefault();
    moveCaret(start - 1);
    return true;
  }

  if (ctrl && key === "f") {
    event.preventDefault();
    moveCaret(start + 1);
    return true;
  }

  if (alt && key === "b") {
    event.preventDefault();
    moveCaret(previousWordIndex(value, start));
    return true;
  }

  if (alt && key === "f") {
    event.preventDefault();
    moveCaret(nextWordIndex(value, end));
    return true;
  }

  if (ctrl && key === "p") {
    event.preventDefault();
    moveCaret(multiline ? previousLineIndex(value, start) : 0);
    return true;
  }

  if (ctrl && key === "n") {
    event.preventDefault();
    moveCaret(multiline ? nextLineIndex(value, start) : value.length);
    return true;
  }

  if (ctrl && (key === "h" || key === "Backspace")) {
    event.preventDefault();
    if (start !== end) {
      replaceRange(start, end, "");
    } else if (start > 0) {
      replaceRange(start - 1, start, "");
    }
    return true;
  }

  if (ctrl && key === "d") {
    event.preventDefault();
    if (start !== end) {
      replaceRange(start, end, "");
    } else if (start < value.length) {
      replaceRange(start, start + 1, "");
    }
    return true;
  }

  if (ctrl && key === "w") {
    event.preventDefault();
    if (start !== end) {
      replaceRange(start, end, "", value.slice(start, end));
    } else {
      const previousWord = previousWordIndex(value, start);
      replaceRange(previousWord, start, "", value.slice(previousWord, start));
    }
    return true;
  }

  if (alt && key === "d") {
    event.preventDefault();
    if (start !== end) {
      replaceRange(start, end, "", value.slice(start, end));
    } else {
      const nextWord = nextWordIndex(value, start);
      replaceRange(start, nextWord, "", value.slice(start, nextWord));
    }
    return true;
  }

  if (ctrl && key === "k") {
    event.preventDefault();
    if (start !== end) {
      replaceRange(start, end, "", value.slice(start, end));
    } else {
      const lineEnd = lineEndIndex(value, start);
      const killEnd = lineEnd === start && start < value.length ? start + 1 : lineEnd;
      replaceRange(start, killEnd, "", value.slice(start, killEnd));
    }
    return true;
  }

  if (ctrl && key === "u") {
    event.preventDefault();
    const lineStart = lineStartIndex(value, start);
    replaceRange(lineStart, end, "", value.slice(lineStart, end));
    return true;
  }

  if (ctrl && key === "y" && killRing) {
    event.preventDefault();
    replaceRange(start, end, killRing);
    return true;
  }

  return false;
}

function starterMarkdown(title) {
  return `# ${title || "document"}\n\n`;
}

function MarkdownInline({ value }) {
  return inlineParts(value).map((part, index) => {
    if (part.type === "code") {
      return <code key={index}>{part.value}</code>;
    }
    if (part.type === "math") {
      return (
        <span
          key={index}
          className="inline-latex"
          dangerouslySetInnerHTML={{ __html: renderLatex(part.value, false) }}
        />
      );
    }
    return String(part.value)
      .split("\n")
      .map((line, lineIndex) => (
        <React.Fragment key={`${index}-${lineIndex}`}>
          {lineIndex > 0 && <br />}
          {line}
        </React.Fragment>
      ));
  });
}

function markdownImageSource(fileName, src) {
  if (/^(https?:|data:|blob:)/i.test(src)) {
    return src;
  }
  return `/api/asset?file=${encodeURIComponent(fileName)}&path=${encodeURIComponent(src)}`;
}

function LineNumber({ value }) {
  return (
    <span className="line-number" aria-hidden="true">
      {value}
    </span>
  );
}

function NumberedLine({ line, className, children }) {
  return (
    <div className={cx("numbered-line", className)} data-line={line}>
      <LineNumber value={line} />
      <div className="line-body">{children}</div>
    </div>
  );
}

function NumberedBlock({ lineNumbers = [], className, children }) {
  const firstLine = lineNumbers[0] ?? "";
  const lastLine = lineNumbers[lineNumbers.length - 1];
  const lineLabel = lineNumbers.length > 1 ? `${firstLine}-${lastLine}` : firstLine;
  return (
    <div className={cx("numbered-block", className)}>
      <div className="block-line-numbers" aria-hidden="true">
        <LineNumber value={lineLabel} />
      </div>
      <div className="block-body">{children}</div>
    </div>
  );
}

function LatexBlock({ value }) {
  const rows = leftAlignedLatexRows(value);
  if (rows) {
    return (
      <div className="latex-render latex-stack">
        {rows.map((row, index) => (
          <div
            key={index}
            className="latex-stack-row"
            dangerouslySetInnerHTML={{ __html: renderLatex(row, true) }}
          />
        ))}
      </div>
    );
  }

  return <div className="latex-render" dangerouslySetInnerHTML={{ __html: renderLatex(value, true) }} />;
}

function PlotBlock({ value }) {
  const shellRef = useRef(null);
  const frameRef = useRef(null);
  const id = useMemo(() => `plot-${Math.random().toString(36).slice(2)}`, []);
  const [result, setResult] = useState({ ok: false, error: "", plots: null });
  const [plotWidth, setPlotWidth] = useState(820);
  const srcDoc = useMemo(() => plotFrameSource(value, id), [id, value]);
  const rendered = useMemo(
    () => (result.plots ? renderPlotSvg(result.plots, { width: plotWidth }) : null),
    [plotWidth, result.plots]
  );

  useEffect(() => {
    const node = shellRef.current;
    if (!node) {
      return undefined;
    }
    const updateWidth = () => {
      const width = Math.floor(node.getBoundingClientRect().width);
      if (width > 0) {
        setPlotWidth(Math.max(300, Math.min(920, width)));
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setResult({ ok: false, error: "", plots: null });
    const onMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow) {
        return;
      }
      const data = event.data || {};
      if (data.type !== "bvim-plot-result" || data.id !== id) {
        return;
      }
      setResult({
        ok: Boolean(data.ok),
        error: data.ok ? "" : String(data.error || "render failed"),
        plots: data.ok && Array.isArray(data.plots) ? data.plots : null
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [id, value]);

  return (
    <div className="plot-shell" ref={shellRef}>
      <iframe
        ref={frameRef}
        className="plot-runner-frame"
        title="bvim plot runner"
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        scrolling="no"
        allowtransparency="true"
      />
      {result.error && <div className="plot-error">plot error: {result.error}</div>}
      {!result.error && !rendered && <div className="plot-pending">rendering plot</div>}
      {rendered && <div className="plot-render" dangerouslySetInnerHTML={{ __html: rendered.html }} />}
    </div>
  );
}

function MarkdownDocument({ markdown, fileName }) {
  const nodes = useMemo(() => parseMarkdown(markdown), [markdown]);

  if (!nodes.length) {
    return <div className="empty-state">empty markdown</div>;
  }

  return (
    <article className="markdown-doc">
      {nodes.map((node, index) => {
        if (node.type === "heading") {
          const Tag = `h${node.level}`;
          return (
            <NumberedLine key={index} line={node.line} className="heading-line">
              <Tag>
                <span className="heading-marker" aria-hidden="true">
                  {"#".repeat(node.level)}{" "}
                </span>
                <MarkdownInline value={node.value} />
              </Tag>
            </NumberedLine>
          );
        }
        if (node.type === "blank") {
          return (
            <NumberedLine key={index} line={node.line} className="blank-line">
              <div className="blank-line-body" aria-hidden="true">
                {" "}
              </div>
            </NumberedLine>
          );
        }
        if (node.type === "paragraph") {
          return (
            <div key={index} className="paragraph-lines">
              {node.lines.map((line, lineIndex) => (
                <NumberedLine
                  key={`${node.lineNumbers[lineIndex]}-${lineIndex}`}
                  line={node.lineNumbers[lineIndex]}
                  className="paragraph-line"
                >
                  <div className="paragraph-text">
                    <MarkdownInline value={line} />
                  </div>
                </NumberedLine>
              ))}
            </div>
          );
        }
        if (node.type === "list") {
          return (
            <div key={index} className={cx("rendered-list", node.ordered && "ordered")}>
              {node.items.map((item, itemIndex) => (
                <NumberedLine key={`${item.line}-${itemIndex}`} line={item.line} className="list-line">
                  <div className="rendered-list-item">
                    <span className="list-marker" aria-hidden="true">
                      {item.marker}
                    </span>
                    <span>
                      <MarkdownInline value={item.value} />
                    </span>
                  </div>
                </NumberedLine>
              ))}
            </div>
          );
        }
        if (node.type === "quote") {
          return (
            <div key={index} className="quote-lines">
              {node.lines.map((line, lineIndex) => (
                <NumberedLine
                  key={`${node.lineNumbers[lineIndex]}-${lineIndex}`}
                  line={node.lineNumbers[lineIndex]}
                  className="quote-line"
                >
                  <div className="quote-text">
                    <MarkdownInline value={line} />
                  </div>
                </NumberedLine>
              ))}
            </div>
          );
        }
        if (node.type === "code") {
          const codeLines = node.lines.length ? node.lines : [""];
          return (
            <div key={index} className="code-lines" data-language={node.language || undefined}>
              {codeLines.map((line, lineIndex) => (
                <NumberedLine
                  key={`${node.lineNumbers[lineIndex]}-${lineIndex}`}
                  line={node.lineNumbers[lineIndex]}
                  className="code-line"
                >
                  <pre>
                    <code>{line || " "}</code>
                  </pre>
                </NumberedLine>
              ))}
            </div>
          );
        }
        if (node.type === "plot") {
          return (
            <NumberedBlock key={index} lineNumbers={node.lineNumbers} className="plot-line">
              <PlotBlock value={node.value} />
            </NumberedBlock>
          );
        }
        if (node.type === "latex") {
          return (
            <NumberedBlock key={index} lineNumbers={node.lineNumbers} className="latex-line">
              <LatexBlock value={node.value} />
            </NumberedBlock>
          );
        }
        if (node.type === "image") {
          return (
            <NumberedLine key={index} line={node.line} className="image-line">
              <figure>
                <img src={markdownImageSource(fileName, node.src)} alt={node.alt || node.title || ""} />
                {(node.title || node.alt) && <figcaption>{node.title || node.alt}</figcaption>}
              </figure>
            </NumberedLine>
          );
        }
        if (node.type === "rule") {
          return (
            <NumberedLine key={index} line={node.line} className="rule-line">
              <hr />
            </NumberedLine>
          );
        }
        return null;
      })}
    </article>
  );
}

function DocumentIndexOverlay({
  headings,
  selectedIndex,
  onSelect,
  onChoose,
  onClose,
  refValue
}) {
  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <section
        ref={refValue}
        className="document-index-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Document index"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="picker-title">index</div>
        {headings.length ? (
          <div className="document-index-list" role="listbox" aria-label="Headings">
            {headings.map((heading, index) => (
              <button
                key={heading.id}
                type="button"
                className={cx("document-index-option", index === selectedIndex && "active")}
                style={{ paddingLeft: `${8 + heading.depth * 14}px` }}
                role="option"
                aria-selected={index === selectedIndex}
                onMouseEnter={() => onSelect(index)}
                onClick={() => onChoose(index)}
              >
                <span className="index-line">{heading.line}</span>
                <span className="index-title">{heading.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="document-index-empty">no headings</div>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const [fileName, setFileName] = useState(START_FILE);
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [mtimeMs, setMtimeMs] = useState(null);
  const [mode, setMode] = useState("normal");
  const [command, setCommand] = useState("");
  const [message, setMessage] = useState("ready");
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [headingIndexSelection, setHeadingIndexSelection] = useState(0);
  const [needsDocument, setNeedsDocument] = useState(!START_FILE);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [openingDocument, setOpeningDocument] = useState(false);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [recentIndex, setRecentIndex] = useState(0);
  const [setupTitle, setSetupTitle] = useState("");
  const [setupPath, setSetupPath] = useState("");
  const [pathCompletions, setPathCompletions] = useState([]);
  const [pathCompletionIndex, setPathCompletionIndex] = useState(-1);
  const [keyboardLockState, setKeyboardLockState] = useState("idle");
  const commandRef = useRef(null);
  const documentRef = useRef(null);
  const editorRef = useRef(null);
  const indexRef = useRef(null);
  const scrollMeterRef = useRef(null);
  const setupTitleRef = useRef(null);
  const setupPathRef = useRef(null);
  const shortcutsRef = useRef(null);
  const forceQuitRef = useRef(false);
  const pendingKeyRef = useRef("");
  const parsedNodes = useMemo(() => parseMarkdown(markdown), [markdown]);
  const headingIndex = useMemo(() => headingIndexFromNodes(parsedNodes), [parsedNodes]);

  const updateScrollProgress = useCallback(() => {
    const node = documentRef.current;
    if (!node) {
      setScrollMeterProgress(scrollMeterRef.current, 1);
      return;
    }

    const maxScroll = node.scrollHeight - node.clientHeight;
    const nextProgress = maxScroll > 0 ? node.scrollTop / maxScroll : 1;
    setScrollMeterProgress(scrollMeterRef.current, nextProgress);
  }, []);

  const loadDocument = useCallback(
    async (nextFile = START_FILE, { silent = false, requireExists = false, remember = false } = {}) => {
      const query = new URLSearchParams({ file: nextFile });
      if (remember) {
        query.set("remember", "1");
      }
      const response = await fetch(`/api/document?${query.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to open markdown");
      }
      const document = await response.json();
      if (requireExists && !document.exists) {
        throw new Error(`document not found: ${nextFile}`);
      }
      setFileName(document.file || nextFile || START_FILE);
      setTitle(document.title || nextFile || "document");
      setMarkdown(document.markdown || "");
      setMtimeMs(document.mtimeMs ?? null);
      setClosed(false);
      setNeedsDocument(false);
      if (!silent) {
        setMessage(`${document.file || nextFile} loaded`);
      }
    },
    []
  );

  const reloadDocument = useCallback(
    async ({ silent = false } = {}) => {
      if (!fileName) {
        return;
      }
      await loadDocument(fileName, { silent });
    },
    [fileName, loadDocument]
  );

  const loadRecentDocuments = useCallback(async () => {
    try {
      const response = await fetch("/api/recent-documents");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load recent documents");
      }
      const documents = Array.isArray(payload.documents) ? payload.documents : [];
      setRecentDocuments(documents);
      setRecentIndex(0);
      setOpeningDocument(false);
      setCreatingDocument(documents.length === 0);
      setMessage(documents.length ? "select recent, open path, or create new" : "name document");
    } catch (error) {
      setOpeningDocument(false);
      setCreatingDocument(true);
      setMessage(error.message);
    }
  }, []);

  useEffect(() => {
    if (!START_FILE) {
      setNeedsDocument(true);
      loadRecentDocuments();
      return;
    }
    loadDocument(START_FILE).catch((error) => setMessage(error.message));
  }, [loadDocument, loadRecentDocuments]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateScrollProgress);
    return () => window.cancelAnimationFrame(frame);
  }, [markdown, updateScrollProgress]);

  useEffect(() => {
    window.addEventListener("resize", updateScrollProgress);
    return () => window.removeEventListener("resize", updateScrollProgress);
  }, [updateScrollProgress]);

  useEffect(() => {
    if (needsDocument || !fileName) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/document?file=${encodeURIComponent(fileName)}`);
        if (!response.ok) {
          return;
        }
        const document = await response.json();
        if (document.exists && document.mtimeMs !== mtimeMs) {
          setTitle(document.title || fileName);
          setMarkdown(document.markdown || "");
          setMtimeMs(document.mtimeMs ?? null);
          setMessage("updated from disk");
        }
      } catch {
        // External edit polling should stay quiet.
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [fileName, mtimeMs, needsDocument]);

  const createNamedDocument = useCallback(async () => {
    const nextTitle = setupTitle.trim();
    if (!nextTitle) {
      setMessage("document name required");
      setupTitleRef.current?.focus();
      return;
    }

    const targetFile = resolveNamedDocumentPath(nextTitle, setupPath);
    setSaving(true);
    try {
      const existingResponse = await fetch(`/api/document?file=${encodeURIComponent(targetFile)}`);
      const existing = await existingResponse.json().catch(() => ({}));
      if (!existingResponse.ok) {
        throw new Error(existing.error || "Unable to create document");
      }

      if (existing.exists) {
        await loadDocument(targetFile, { remember: true });
        setCreatingDocument(false);
        setOpeningDocument(false);
        setPathCompletions([]);
        return;
      }

      const saveResponse = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: targetFile, markdown: starterMarkdown(nextTitle) })
      });
      const saved = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) {
        throw new Error(saved.error || "Save failed");
      }
      await loadDocument(targetFile);
      setCreatingDocument(false);
      setOpeningDocument(false);
      setPathCompletions([]);
      setMode("normal");
      setMessage(`${saved.file || targetFile} created`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }, [loadDocument, setupPath, setupTitle]);

  const openPathDocument = useCallback(async () => {
    const targetFile = setupPath.trim();
    if (!targetFile || targetFile === "~" || targetFile === "~/") {
      setMessage("document path required");
      setupPathRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      await loadDocument(targetFile, { requireExists: true, remember: true });
      setCreatingDocument(false);
      setOpeningDocument(false);
      setPathCompletions([]);
      setPathCompletionIndex(-1);
      setMode("normal");
    } catch (error) {
      setMessage(error.message);
      setupPathRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }, [loadDocument, setupPath]);

  const openRecentDocument = useCallback(
    async (document) => {
      if (!document?.path) {
        return;
      }
      try {
        await loadDocument(document.path, { remember: true });
        setCreatingDocument(false);
        setOpeningDocument(false);
      } catch (error) {
        setMessage(error.message);
        loadRecentDocuments();
      }
    },
    [loadDocument, loadRecentDocuments]
  );

  const startCreatingDocument = useCallback(() => {
    setCreatingDocument(true);
    setOpeningDocument(false);
    setPathCompletions([]);
    setPathCompletionIndex(-1);
    setMessage("name document");
    window.requestAnimationFrame(() => setupTitleRef.current?.focus());
  }, []);

  const startOpeningDocument = useCallback(() => {
    setOpeningDocument(true);
    setCreatingDocument(false);
    setPathCompletions([]);
    setPathCompletionIndex(-1);
    setMessage("enter markdown path");
    window.requestAnimationFrame(() => setupPathRef.current?.focus());
  }, []);

  const applySetupPathValue = useCallback((nextValue) => {
    setSetupPath(nextValue);
    window.requestAnimationFrame(() => {
      setupPathRef.current?.focus();
      setupPathRef.current?.setSelectionRange(nextValue.length, nextValue.length);
    });
  }, []);

  const completeSetupPath = useCallback(async () => {
    try {
      const response = await fetch(`/api/path-completions?path=${encodeURIComponent(setupPath)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "path completion failed");
      }

      const completions = Array.isArray(payload.completions) ? payload.completions : [];
      const values = completions.map((completion) => completion.value).filter(Boolean);
      setPathCompletions(completions);

      if (!values.length) {
        setPathCompletionIndex(-1);
        setMessage("no path matches");
        return;
      }

      const prefix = longestCommonPrefix(values);
      if (prefix.length > setupPath.length) {
        applySetupPathValue(prefix);
        setPathCompletionIndex(-1);
        setMessage(`${values.length} path match${values.length === 1 ? "" : "es"}`);
        return;
      }

      const currentIndex = values.indexOf(setupPath);
      const nextIndex =
        currentIndex >= 0
          ? (currentIndex + 1) % values.length
          : (pathCompletionIndex + 1 + values.length) % values.length;
      applySetupPathValue(values[nextIndex]);
      setPathCompletionIndex(nextIndex);
      setMessage(`${nextIndex + 1}/${values.length} ${completions[nextIndex].type}`);
    } catch (error) {
      setMessage(error.message);
      setPathCompletions([]);
      setPathCompletionIndex(-1);
    }
  }, [applySetupPathValue, pathCompletionIndex, setupPath]);

  const returnToRecentMenu = useCallback(() => {
    if (recentDocuments.length > 0) {
      setCreatingDocument(false);
      setOpeningDocument(false);
      setPathCompletions([]);
      setPathCompletionIndex(-1);
      setMessage("select recent, open path, or create new");
      window.requestAnimationFrame(() => editorRef.current?.focus());
      return;
    }
    setOpeningDocument(false);
    setCreatingDocument(true);
    setMessage("name document");
    window.requestAnimationFrame(() => setupTitleRef.current?.focus());
  }, [recentDocuments.length]);

  const handleSetupPathKeyDown = useCallback(
    (event) => {
      const key = keyName(event);
      const isCompletionKey =
        event.key === "Tab" ||
        (event.ctrlKey && !event.altKey && !event.metaKey && (key === "i" || event.code === "KeyI"));

      if (isCompletionKey) {
        event.preventDefault();
        completeSetupPath();
        return;
      }

      if (pathCompletions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex =
          (pathCompletionIndex + direction + pathCompletions.length) % pathCompletions.length;
        applySetupPathValue(pathCompletions[nextIndex].value);
        setPathCompletionIndex(nextIndex);
        setMessage(`${nextIndex + 1}/${pathCompletions.length} ${pathCompletions[nextIndex].type}`);
        return;
      }

      handleTextControlKeyDown(event, {
        setValue: (nextValue) => {
          setSetupPath(nextValue);
          setPathCompletions([]);
          setPathCompletionIndex(-1);
        },
        onEnter: openingDocument ? openPathDocument : createNamedDocument,
        onEscape: returnToRecentMenu
      });
    },
    [
      applySetupPathValue,
      completeSetupPath,
      createNamedDocument,
      openPathDocument,
      openingDocument,
      pathCompletionIndex,
      pathCompletions,
      returnToRecentMenu
    ]
  );

  const closeEditor = useCallback(() => {
    forceQuitRef.current = true;
    setClosed(true);
    setMode("normal");
    setMessage("closed");
    window.bvimDesktop?.quit?.();
    window.setTimeout(() => window.close(), 0);
  }, []);

  const requestKeyboardLock = useCallback(async () => {
    if (!navigator.keyboard?.lock) {
      setKeyboardLockState("unsupported");
      setMessage("keyboard lock unsupported");
      return;
    }

    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
      await navigator.keyboard.lock(KEYBOARD_LOCK_KEYS);
      setKeyboardLockState("locked");
      setMessage("keyboard locked");
      editorRef.current?.focus();
    } catch (error) {
      setKeyboardLockState("failed");
      setMessage(`keyboard lock failed: ${error.message}`);
    }
  }, []);

  const openExternalEditor = useCallback(async (lineNumber = null) => {
    if (!fileName) {
      return;
    }
    try {
      const line = lineNumber === null ? null : Number(lineNumber);
      if (line !== null && (!Number.isInteger(line) || line < 1)) {
        throw new Error("line must be a positive integer");
      }
      const response = await fetch("/api/open-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: fileName, line })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to open vim");
      }
      setMessage(
        payload.line
          ? `opened line ${payload.line} in ${payload.terminal || "terminal"}`
          : `opened in ${payload.terminal || "terminal"}`
      );
    } catch (error) {
      setMessage(error.message);
    }
  }, [fileName]);

  const jumpToHeading = useCallback(
    (index = headingIndexSelection) => {
      const heading = headingIndex[index];
      const node = documentRef.current;
      if (!heading || !node) {
        setMessage("no headings");
        return;
      }
      const target = node.querySelector(`[data-line="${heading.line}"]`);
      if (!target) {
        setMessage(`line ${heading.line}`);
        return;
      }
      const top = target.offsetTop - Math.max(12, node.clientHeight * 0.18);
      node.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      setIndexOpen(false);
      setMessage(`heading ${heading.line}`);
    },
    [headingIndex, headingIndexSelection]
  );

  const toggleDocumentIndex = useCallback(() => {
    setShortcutsOpen(false);
    setIndexOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        setHeadingIndexSelection((index) => {
          if (!headingIndex.length) {
            return 0;
          }
          return Math.min(index, headingIndex.length - 1);
        });
        setMessage(headingIndex.length ? "index" : "no headings");
      }
      return nextOpen;
    });
  }, [headingIndex.length]);

  const scrollDocumentStep = useCallback((direction) => {
    const node = documentRef.current;
    if (!node) {
      return;
    }
    node.scrollBy({ top: direction * documentScrollStep(node), behavior: "auto" });
    updateScrollProgress();
  }, [updateScrollProgress]);

  const scrollDocumentHalfPage = useCallback((direction) => {
    const node = documentRef.current;
    if (!node) {
      return;
    }
    node.scrollBy({ top: direction * node.clientHeight * 0.5, behavior: "auto" });
    updateScrollProgress();
  }, [updateScrollProgress]);

  const scrollDocumentTo = useCallback((position) => {
    const node = documentRef.current;
    if (!node) {
      return;
    }
    node.scrollTo({ top: position, behavior: "auto" });
    updateScrollProgress();
  }, [updateScrollProgress]);

  const runCommand = useCallback(
    async (rawCommand) => {
      const value = rawCommand.trim();
      if (!value) {
        setMode("normal");
        return;
      }

      try {
        if (value === "r" || value === "reload") {
          await reloadDocument();
          setMode("normal");
          setMessage(`${fileName} reloaded`);
          return;
        }

        if (value === "edit") {
          await openExternalEditor();
          setMode("normal");
          return;
        }

        if (value === "index" || value === "i") {
          toggleDocumentIndex();
          setMode("normal");
          return;
        }

        if (/^\d+$/.test(value)) {
          await openExternalEditor(Number(value));
          setMode("normal");
          return;
        }

        if (value === "lock") {
          await requestKeyboardLock();
          setMode("normal");
          return;
        }

        if (value.startsWith("e ")) {
          const [, ...nameParts] = value.split(/\s+/);
          await loadDocument(nameParts.join(" "), { remember: true });
          setMode("normal");
          return;
        }

        setMessage(`not an editor command: ${value}`);
        setMode("normal");
      } catch (error) {
        setMessage(error.message);
        setMode("normal");
      }
    },
    [fileName, loadDocument, openExternalEditor, reloadDocument, requestKeyboardLock, toggleDocumentIndex]
  );

  useEffect(() => {
    if (mode === "command") {
      commandRef.current?.focus();
      return;
    }
    if (mode === "normal") {
      editorRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (shortcutsOpen) {
      shortcutsRef.current?.focus();
    }
  }, [shortcutsOpen]);

  useEffect(() => {
    if (indexOpen) {
      indexRef.current?.focus();
    }
  }, [indexOpen]);

  useEffect(() => {
    if (!indexOpen) {
      return;
    }
    setHeadingIndexSelection((index) => {
      if (!headingIndex.length) {
        return 0;
      }
      return Math.min(index, headingIndex.length - 1);
    });
  }, [headingIndex.length, indexOpen]);

  useEffect(() => {
    if (!indexOpen) {
      return;
    }
    indexRef.current?.querySelector(".document-index-option.active")?.scrollIntoView({
      block: "nearest"
    });
  }, [headingIndexSelection, indexOpen]);

  useEffect(() => {
    if (needsDocument && creatingDocument) {
      setupTitleRef.current?.focus();
      return;
    }
    if (needsDocument && openingDocument) {
      setupPathRef.current?.focus();
      return;
    }
    if (needsDocument) {
      editorRef.current?.focus();
    }
  }, [creatingDocument, needsDocument, openingDocument]);

  useEffect(() => {
    const unsubscribe = window.bvimDesktop?.onControlKey?.((key) => {
      const target = document.activeElement;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      const normalizedKey = String(key || "").toLowerCase();
      const event = new KeyboardEvent("keydown", {
        key: normalizedKey,
        code: `Key${normalizedKey.toUpperCase()}`,
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(event);
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const syncKeyboardLockState = () => {
      if (!document.fullscreenElement && keyboardLockState === "locked") {
        navigator.keyboard?.unlock?.();
        setKeyboardLockState("idle");
        setMessage("keyboard unlocked");
      }
    };

    document.addEventListener("fullscreenchange", syncKeyboardLockState);
    return () => document.removeEventListener("fullscreenchange", syncKeyboardLockState);
  }, [keyboardLockState]);

  useEffect(() => {
    const suppressCloseTabShortcut = (event) => {
      if (isCloseTabShortcut(event)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", suppressCloseTabShortcut, { capture: true });
    return () => {
      window.removeEventListener("keydown", suppressCloseTabShortcut, { capture: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName;
      const typingTarget = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      const key = keyName(event);

      if (event.ctrlKey && !event.altKey && !event.metaKey && key === "c") {
        event.preventDefault();
        closeEditor();
        return;
      }

      if (!typingTarget && event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
        return;
      }

      if (shortcutsOpen) {
        if (isEscapeKey(event) || event.key === "?") {
          event.preventDefault();
          setShortcutsOpen(false);
        }
        return;
      }

      if (indexOpen) {
        if (isEscapeKey(event) || event.key === "i") {
          event.preventDefault();
          setIndexOpen(false);
          return;
        }
        if (event.key === "j" || event.key === "ArrowDown") {
          event.preventDefault();
          setHeadingIndexSelection((index) =>
            headingIndex.length ? Math.min(headingIndex.length - 1, index + 1) : 0
          );
          return;
        }
        if (event.key === "k" || event.key === "ArrowUp") {
          event.preventDefault();
          setHeadingIndexSelection((index) => Math.max(0, index - 1));
          return;
        }
        if (isEnterKey(event)) {
          event.preventDefault();
          jumpToHeading();
          return;
        }
        return;
      }

      if (needsDocument) {
        if (typingTarget) {
          return;
        }

        if (event.key === "n") {
          event.preventDefault();
          startCreatingDocument();
          return;
        }

        if (event.key === "o") {
          event.preventDefault();
          startOpeningDocument();
          return;
        }

        if (!creatingDocument && !openingDocument && recentDocuments.length) {
          if (event.key === "j" || event.key === "ArrowDown") {
            event.preventDefault();
            setRecentIndex((index) => Math.min(recentDocuments.length - 1, index + 1));
            return;
          }
          if (event.key === "k" || event.key === "ArrowUp") {
            event.preventDefault();
            setRecentIndex((index) => Math.max(0, index - 1));
            return;
          }
          if (isEnterKey(event)) {
            event.preventDefault();
            openRecentDocument(recentDocuments[recentIndex]);
            return;
          }
        }
        return;
      }

      if (mode === "command" || typingTarget) {
        return;
      }

      if (pendingKeyRef.current === "g") {
        pendingKeyRef.current = "";
        if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === "g") {
          event.preventDefault();
          scrollDocumentTo(0);
          setMessage("top");
          return;
        }
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && key === "s") {
        event.preventDefault();
        reloadDocument().catch((error) => setMessage(error.message));
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && (key === "j" || event.code === "KeyJ")) {
        event.preventDefault();
        scrollDocumentHalfPage(1);
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && (key === "k" || event.code === "KeyK")) {
        event.preventDefault();
        scrollDocumentHalfPage(-1);
        return;
      }

      if (event.key === ":") {
        event.preventDefault();
        setCommand("");
        setMode("command");
        return;
      }

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        scrollDocumentStep(1);
        return;
      }

      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        scrollDocumentStep(-1);
        return;
      }

      if (event.key === "g") {
        event.preventDefault();
        pendingKeyRef.current = "g";
        setMessage("go");
        return;
      }

      if (event.key === "G") {
        event.preventDefault();
        const node = documentRef.current;
        scrollDocumentTo(node ? node.scrollHeight : 0);
        setMessage("bottom");
        return;
      }

      if (event.key === "i") {
        event.preventDefault();
        toggleDocumentIndex();
        return;
      }

      if (isEnterKey(event)) {
        event.preventDefault();
        openExternalEditor();
        return;
      }

      if (event.key === "r") {
        event.preventDefault();
        reloadDocument().catch((error) => setMessage(error.message));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    closeEditor,
    creatingDocument,
    headingIndex.length,
    indexOpen,
    jumpToHeading,
    mode,
    needsDocument,
    openExternalEditor,
    openRecentDocument,
    openingDocument,
    recentDocuments,
    recentIndex,
    reloadDocument,
    scrollDocumentHalfPage,
    scrollDocumentStep,
    scrollDocumentTo,
    shortcutsOpen,
    startCreatingDocument,
    startOpeningDocument,
    toggleDocumentIndex
  ]);

  if (closed) {
    return (
      <main className="closed-screen">
        <div>
          <p className="eyebrow">bvim</p>
          <h1>{fileName}</h1>
          <p>{message}</p>
        </div>
      </main>
    );
  }

  if (needsDocument) {
    const showRecentDocuments = !creatingDocument && !openingDocument && recentDocuments.length > 0;
    const showNewDocumentForm = creatingDocument || (!openingDocument && recentDocuments.length === 0);
    const showOpenDocumentForm = openingDocument;
    const setupPathField = (
      <label>
        <span>path</span>
        <input
          ref={setupPathRef}
          value={setupPath}
          placeholder="~/"
          onChange={(event) => {
            setSetupPath(event.target.value);
            setPathCompletions([]);
            setPathCompletionIndex(-1);
          }}
          onKeyDown={handleSetupPathKeyDown}
          aria-label={openingDocument ? "Markdown file path" : "Document path"}
        />
        {pathCompletions.length > 0 && (
          <div className="path-completions" aria-label="Path completions">
            {pathCompletions.slice(0, 6).map((completion, index) => (
              <div
                key={`${completion.value}-${index}`}
                className={cx("path-completion", index === pathCompletionIndex && "active")}
              >
                <span>{completion.value}</span>
                <em>{completion.type}</em>
              </div>
            ))}
          </div>
        )}
      </label>
    );

    return (
      <main className="setup-screen" ref={editorRef} tabIndex={-1}>
        <form
          className="setup-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (openingDocument) {
              openPathDocument();
              return;
            }
            createNamedDocument();
          }}
        >
          <div className="brand setup-brand">
            <span className="brand-mark">b</span>
            <span>bvim</span>
          </div>

          {showRecentDocuments && (
            <section className="recent-documents" aria-label="Recent documents">
              <div className="setup-section-title">recent files</div>
              <div className="recent-list">
                {recentDocuments.map((document, index) => (
                  <button
                    key={document.path}
                    type="button"
                    className={cx("recent-document", index === recentIndex && "active")}
                    onClick={() => openRecentDocument(document)}
                    onMouseEnter={() => setRecentIndex(index)}
                  >
                    <strong>{document.title || document.file}</strong>
                    <span>{document.file || document.path}</span>
                  </button>
                ))}
              </div>
              <div className="setup-actions">
                <button type="button" className="secondary-action" onClick={startCreatingDocument}>
                  new document
                </button>
                <button type="button" className="secondary-action" onClick={startOpeningDocument}>
                  open path
                </button>
              </div>
            </section>
          )}

          {showNewDocumentForm && (
            <>
              <div className="setup-actions">
                {recentDocuments.length > 0 && (
                  <button type="button" className="secondary-action" onClick={returnToRecentMenu}>
                    recent files
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-action"
                  onClick={startOpeningDocument}
                >
                  open path
                </button>
              </div>
              <label>
                <span>document name</span>
                <input
                  ref={setupTitleRef}
                  value={setupTitle}
                  onChange={(event) => setSetupTitle(event.target.value)}
                  onKeyDown={(event) =>
                    handleTextControlKeyDown(event, {
                      setValue: setSetupTitle,
                      onEnter: () => setupPathRef.current?.focus(),
                      onEscape: returnToRecentMenu
                    })
                  }
                  aria-label="Document name"
                />
              </label>
              {setupPathField}
              <button type="submit" disabled={saving}>
                {saving ? "creating" : "create"}
              </button>
            </>
          )}

          {showOpenDocumentForm && (
            <>
              <div className="setup-actions">
                {recentDocuments.length > 0 && (
                  <button type="button" className="secondary-action" onClick={returnToRecentMenu}>
                    recent files
                  </button>
                )}
                <button type="button" className="secondary-action" onClick={startCreatingDocument}>
                  new document
                </button>
              </div>
              {setupPathField}
              <button type="submit" disabled={saving}>
                {saving ? "opening" : "open"}
              </button>
            </>
          )}
          <p className="setup-message">{message}</p>
        </form>
        {shortcutsOpen && <ShortcutsOverlay refValue={shortcutsRef} onClose={() => setShortcutsOpen(false)} />}
      </main>
    );
  }

  return (
    <main className="app-shell" ref={editorRef} tabIndex={-1}>
      <section className="workspace">
        <section
          ref={documentRef}
          className="document"
          aria-label="Markdown preview"
          onScroll={updateScrollProgress}
        >
          <MarkdownDocument markdown={markdown} fileName={fileName} />
        </section>
      </section>

      <div className="scroll-meter" aria-hidden="true">
        <span ref={scrollMeterRef} />
      </div>

      {shortcutsOpen && <ShortcutsOverlay refValue={shortcutsRef} onClose={() => setShortcutsOpen(false)} />}
      {indexOpen && (
        <DocumentIndexOverlay
          refValue={indexRef}
          headings={headingIndex}
          selectedIndex={headingIndexSelection}
          onSelect={setHeadingIndexSelection}
          onChoose={jumpToHeading}
          onClose={() => setIndexOpen(false)}
        />
      )}

      <footer className={cx("commandbar", mode)}>
        <div className="mode">{mode.toUpperCase()}</div>
        {mode === "command" ? (
          <form
            className="command-form"
            onSubmit={(event) => {
              event.preventDefault();
              runCommand(command);
            }}
          >
            <span>:</span>
            <input
              ref={commandRef}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                handleTextControlKeyDown(event, {
                  setValue: setCommand,
                  onEnter: runCommand,
                  onEscape: () => setMode("normal")
                });
              }}
              aria-label="Command"
            />
          </form>
        ) : (
          <div className="message">
            <span>{message}</span>
            <span>{title || fileName}</span>
          </div>
        )}
      </footer>
    </main>
  );
}

function ShortcutsOverlay({ refValue, onClose }) {
  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <section
        ref={refValue}
        className="shortcuts-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="picker-title">shortcuts</div>
        <div className="shortcuts-grid">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="shortcut-group">
              <h2>{group.title}</h2>
              {group.items.map(([keys, description]) => (
                <div className="shortcut-row" key={`${group.title}-${keys}`}>
                  <kbd>{keys}</kbd>
                  <span>{description}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
