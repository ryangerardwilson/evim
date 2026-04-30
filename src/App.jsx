import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import {
  FileImage,
  Sigma,
  Type
} from "lucide-react";
import { resolveNamedDocumentPath } from "./documentPaths.js";

function initialFileName() {
  const params = new URLSearchParams(window.location.search);
  return params.get("file") || "";
}

const START_FILE = initialFileName();
const BLOCK_TYPES = [
  { type: "text", label: "Text", Icon: Type },
  { type: "image", label: "Image", Icon: FileImage },
  { type: "latex", label: "LaTeX", Icon: Sigma }
];
const SHORTCUT_GROUPS = [
  {
    title: "normal",
    items: [
      ["?", "toggle shortcuts"],
      ["n", "new block"],
      ["j / k", "select next / previous block"],
      ["J / K", "move selected block down / up"],
      ["i / enter", "edit selected block"],
      ["o / O", "insert text block after / before"],
      ["x", "delete selected block"],
      [":", "command line"],
      ["ctrl+q", "quit bvim"]
    ]
  },
  {
    title: "commands",
    items: [
      [":w", "save"],
      [":w path", "save as path"],
      [":e path", "open path"],
      [":q", "quit if clean"],
      [":q!", "quit without saving"],
      [":wq", "save and quit"],
      [":lock", "request keyboard lock"]
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
  },
  {
    title: "block picker",
    items: [
      ["j / k", "move choice"],
      ["1 / 2 / 3", "choose block type"],
      ["enter", "insert selected type"],
      ["esc", "cancel"]
    ]
  }
];
const KEYBOARD_LOCK_KEYS = [
  "Backspace",
  "BracketLeft",
  "Enter",
  "KeyA",
  "KeyB",
  "KeyD",
  "KeyE",
  "KeyF",
  "KeyH",
  "KeyI",
  "KeyK",
  "KeyM",
  "KeyN",
  "KeyP",
  "KeyU",
  "KeyW",
  "KeyY",
  "Tab"
];
let killRing = "";

function makeBlock(type) {
  const id = `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (type === "latex") {
    return { id, type, content: "E = mc^2", meta: {} };
  }
  if (type === "image") {
    return { id, type, content: "", meta: { name: "", caption: "" } };
  }
  return { id, type: "text", content: "", meta: {} };
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function renderLatex(source) {
  try {
    return katex.renderToString(source || "", {
      displayMode: true,
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

  if (ctrl && (key === "m" || key === "Enter")) {
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

export default function App() {
  const [fileName, setFileName] = useState(START_FILE);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("normal");
  const [command, setCommand] = useState("");
  const [message, setMessage] = useState("ready");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(false);
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);
  const [blockPickerIndex, setBlockPickerIndex] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [needsDocument, setNeedsDocument] = useState(!START_FILE);
  const [setupTitle, setSetupTitle] = useState("");
  const [setupPath, setSetupPath] = useState("");
  const [pathCompletions, setPathCompletions] = useState([]);
  const [pathCompletionIndex, setPathCompletionIndex] = useState(-1);
  const [keyboardLockState, setKeyboardLockState] = useState("idle");
  const commandRef = useRef(null);
  const editorRef = useRef(null);
  const pickerRef = useRef(null);
  const setupTitleRef = useRef(null);
  const setupPathRef = useRef(null);
  const shortcutsRef = useRef(null);
  const forceQuitRef = useRef(false);

  const selectedIndex = useMemo(
    () => blocks.findIndex((block) => block.id === selectedId),
    [blocks, selectedId]
  );

  const selectedBlock = selectedIndex >= 0 ? blocks[selectedIndex] : null;

  const markDirty = useCallback(() => {
    setDirty(true);
    setClosed(false);
  }, []);

  const selectByIndex = useCallback(
    (index) => {
      if (!blocks.length) {
        setSelectedId(null);
        return;
      }
      const nextIndex = Math.max(0, Math.min(blocks.length - 1, index));
      setSelectedId(blocks[nextIndex].id);
    },
    [blocks]
  );

  const loadDocument = useCallback(async (nextFile = START_FILE) => {
    const response = await fetch(`/api/document?file=${encodeURIComponent(nextFile)}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Unable to open document");
    }
    const document = await response.json();
    const nextBlocks = Array.isArray(document.blocks) ? document.blocks : [];
    setFileName(document.file || nextFile || START_FILE);
    setTitle(document.title || nextFile || "document");
    setBlocks(nextBlocks);
    setSelectedId(nextBlocks[0]?.id || null);
    setDirty(false);
    setClosed(false);
    setNeedsDocument(false);
    setMessage(`${document.file || nextFile} opened`);
  }, []);

  useEffect(() => {
    if (!START_FILE) {
      setNeedsDocument(true);
      setMessage("name document");
      return;
    }
    loadDocument(START_FILE).catch((error) => setMessage(error.message));
  }, [loadDocument]);

  const saveDocument = useCallback(
    async (targetFile = fileName) => {
      setSaving(true);
      try {
        const response = await fetch("/api/document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: targetFile, title, blocks })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Save failed");
        }
        setFileName(payload.file || targetFile);
        setDirty(false);
        setMessage(`${payload.file || targetFile} saved`);
        return payload;
      } finally {
        setSaving(false);
      }
    },
    [blocks, fileName, title]
  );

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
        const nextBlocks = Array.isArray(existing.blocks) ? existing.blocks : [];
        setFileName(existing.file || targetFile);
        setTitle(existing.title || nextTitle);
        setBlocks(nextBlocks);
        setSelectedId(nextBlocks[0]?.id || null);
        setDirty(false);
        setNeedsDocument(false);
        setPathCompletions([]);
        setMessage(`${existing.file || targetFile} opened`);
        return;
      }

      const starterBlocks = [makeBlock("text")];
      const saveResponse = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: targetFile, title: nextTitle, blocks: starterBlocks })
      });
      const saved = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) {
        throw new Error(saved.error || "Save failed");
      }
      setFileName(saved.file || targetFile);
      setTitle(nextTitle);
      setBlocks(starterBlocks);
      setSelectedId(starterBlocks[0].id);
      setDirty(false);
      setNeedsDocument(false);
      setPathCompletions([]);
      setMode("normal");
      setMessage(`${saved.file || targetFile} created`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }, [setupPath, setupTitle]);

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
        onEnter: createNamedDocument,
        onEscape: () => setupTitleRef.current?.focus()
      });
    },
    [
      applySetupPathValue,
      completeSetupPath,
      createNamedDocument,
      pathCompletionIndex,
      pathCompletions
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

  const addBlock = useCallback(
    (type, offset = 1) => {
      const block = makeBlock(type);
      setBlocks((current) => {
        if (!current.length || selectedIndex < 0) {
          return [block];
        }
        const next = [...current];
        next.splice(selectedIndex + offset, 0, block);
        return next;
      });
      setSelectedId(block.id);
      setMode("insert");
      setBlockPickerOpen(false);
      markDirty();
    },
    [markDirty, selectedIndex]
  );

  const openBlockPicker = useCallback(() => {
    setBlockPickerIndex(0);
    setBlockPickerOpen(true);
    setMode("normal");
  }, []);

  const chooseBlockType = useCallback(
    (type) => {
      addBlock(type, 1);
    },
    [addBlock]
  );

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

  const updateBlock = useCallback(
    (id, patch) => {
      setBlocks((current) =>
        current.map((block) => (block.id === id ? { ...block, ...patch } : block))
      );
      markDirty();
    },
    [markDirty]
  );

  const updateBlockMeta = useCallback(
    (id, patch) => {
      setBlocks((current) =>
        current.map((block) =>
          block.id === id ? { ...block, meta: { ...block.meta, ...patch } } : block
        )
      );
      markDirty();
    },
    [markDirty]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedBlock) {
      return;
    }
    const nextBlocks = blocks.filter((block) => block.id !== selectedBlock.id);
    const fallbackIndex = Math.max(0, Math.min(selectedIndex, nextBlocks.length - 1));
    setBlocks(nextBlocks);
    setSelectedId(nextBlocks[fallbackIndex]?.id || null);
    setMode("normal");
    markDirty();
  }, [blocks, markDirty, selectedBlock, selectedIndex]);

  const moveSelected = useCallback(
    (direction) => {
      if (selectedIndex < 0) {
        return;
      }
      const nextIndex = selectedIndex + direction;
      if (nextIndex < 0 || nextIndex >= blocks.length) {
        return;
      }
      setBlocks((current) => {
        const next = [...current];
        const [item] = next.splice(selectedIndex, 1);
        next.splice(nextIndex, 0, item);
        return next;
      });
      markDirty();
    },
    [blocks.length, markDirty, selectedIndex]
  );

  const handleImageFile = useCallback(
    (block, file) => {
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        updateBlock(block.id, {
          content: String(reader.result || ""),
          meta: { ...block.meta, name: file.name }
        });
      };
      reader.readAsDataURL(file);
    },
    [updateBlock]
  );

  const runCommand = useCallback(
    async (rawCommand) => {
      const value = rawCommand.trim();
      if (!value) {
        setMode("normal");
        return;
      }

      try {
        if (value === "w") {
          await saveDocument();
          setMode("normal");
          return;
        }

        if (value.startsWith("w ")) {
          const [, ...nameParts] = value.split(/\s+/);
          await saveDocument(nameParts.join(" "));
          setMode("normal");
          return;
        }

        if (value === "wq" || value === "x") {
          await saveDocument();
          closeEditor();
          return;
        }

        if (value === "q") {
          if (dirty) {
            setMessage("no write since last change");
            setMode("normal");
            return;
          }
          closeEditor();
          return;
        }

        if (value === "q!") {
          closeEditor();
          return;
        }

        if (value === "lock") {
          await requestKeyboardLock();
          setMode("normal");
          return;
        }

        if (value.startsWith("e ")) {
          const [, ...nameParts] = value.split(/\s+/);
          await loadDocument(nameParts.join(" "));
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
    [closeEditor, dirty, loadDocument, requestKeyboardLock, saveDocument]
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
    if (blockPickerOpen) {
      pickerRef.current?.focus();
    }
  }, [blockPickerOpen]);

  useEffect(() => {
    if (shortcutsOpen) {
      shortcutsRef.current?.focus();
    }
  }, [shortcutsOpen]);

  useEffect(() => {
    if (needsDocument) {
      setupTitleRef.current?.focus();
    }
  }, [needsDocument]);

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

    const protectDirtyClose = (event) => {
      if (!dirty || forceQuitRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("keydown", suppressCloseTabShortcut, { capture: true });
    window.addEventListener("beforeunload", protectDirtyClose);
    return () => {
      window.removeEventListener("keydown", suppressCloseTabShortcut, { capture: true });
      window.removeEventListener("beforeunload", protectDirtyClose);
    };
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName;
      const typingTarget = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      const key = keyName(event);

      if (event.ctrlKey && !event.altKey && !event.metaKey && key === "q") {
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

      if (needsDocument) {
        return;
      }

      if (mode === "command") {
        return;
      }

      if (mode === "insert") {
        if (isEscapeKey(event)) {
          event.preventDefault();
          setMode("normal");
          editorRef.current?.focus();
        }
        return;
      }

      if (blockPickerOpen) {
        if (isEscapeKey(event)) {
          event.preventDefault();
          setBlockPickerOpen(false);
          editorRef.current?.focus();
          return;
        }

        if (event.key === "j" || event.key === "ArrowDown") {
          event.preventDefault();
          setBlockPickerIndex((index) => Math.min(BLOCK_TYPES.length - 1, index + 1));
          return;
        }

        if (event.key === "k" || event.key === "ArrowUp") {
          event.preventDefault();
          setBlockPickerIndex((index) => Math.max(0, index - 1));
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          chooseBlockType(BLOCK_TYPES[blockPickerIndex].type);
          return;
        }

        const numericChoice = Number(event.key);
        if (numericChoice >= 1 && numericChoice <= BLOCK_TYPES.length) {
          event.preventDefault();
          chooseBlockType(BLOCK_TYPES[numericChoice - 1].type);
        }
        return;
      }

      if (typingTarget) {
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && key === "s") {
        event.preventDefault();
        saveDocument().catch((error) => setMessage(error.message));
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
        selectByIndex(selectedIndex + 1);
        return;
      }

      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        selectByIndex(selectedIndex - 1);
        return;
      }

      if (event.key === "J") {
        event.preventDefault();
        moveSelected(1);
        return;
      }

      if (event.key === "K") {
        event.preventDefault();
        moveSelected(-1);
        return;
      }

      if (event.key === "i" || event.key === "Enter") {
        event.preventDefault();
        if (selectedBlock) {
          setMode("insert");
        }
        return;
      }

      if (event.key === "n") {
        event.preventDefault();
        openBlockPicker();
        return;
      }

      if (event.key === "o") {
        event.preventDefault();
        addBlock("text", 1);
        return;
      }

      if (event.key === "O") {
        event.preventDefault();
        addBlock("text", 0);
        return;
      }

      if (event.key === "x") {
        event.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    addBlock,
    blockPickerIndex,
    blockPickerOpen,
    chooseBlockType,
    closeEditor,
    deleteSelected,
    mode,
    moveSelected,
    needsDocument,
    openBlockPicker,
    saveDocument,
    selectByIndex,
    selectedBlock,
    selectedIndex,
    shortcutsOpen
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
    return (
      <main className="setup-screen" ref={editorRef} tabIndex={-1}>
        <form
          className="setup-form"
          onSubmit={(event) => {
            event.preventDefault();
            createNamedDocument();
          }}
        >
          <div className="brand setup-brand">
            <span className="brand-mark">b</span>
            <span>bvim</span>
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
                  onEscape: () => editorRef.current?.focus()
                })
              }
              aria-label="Document name"
            />
          </label>
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
              aria-label="Document path"
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
          <button type="submit" disabled={saving}>
            {saving ? "creating" : "create"}
          </button>
          <p className="setup-message">{message}</p>
        </form>
        {shortcutsOpen && <ShortcutsOverlay refValue={shortcutsRef} onClose={() => setShortcutsOpen(false)} />}
      </main>
    );
  }

  return (
    <main className="app-shell" ref={editorRef} tabIndex={-1}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">b</span>
          <span>bvim</span>
        </div>
        <div className="document-heading">
          <strong>{title || fileName}</strong>
          <span>{fileName}</span>
        </div>
        <div className="document-state">{saving ? "saving" : dirty ? "modified" : "saved"}</div>
      </header>

      <section className="workspace">
        <section className="document" aria-label="Document blocks">
          {blocks.length === 0 ? (
            <div className="empty-state">empty</div>
          ) : (
            blocks.map((block, index) => (
              <BlockView
                key={block.id}
                block={block}
                index={index}
                selected={block.id === selectedId}
                insertMode={mode === "insert" && block.id === selectedId}
                onSelect={() => setSelectedId(block.id)}
                onInsert={() => {
                  setSelectedId(block.id);
                  setMode("insert");
                }}
                onExitInsert={() => {
                  setMode("normal");
                  editorRef.current?.focus();
                }}
                onUpdate={(patch) => updateBlock(block.id, patch)}
                onUpdateMeta={(patch) => updateBlockMeta(block.id, patch)}
                onImageFile={(file) => handleImageFile(block, file)}
              />
            ))
          )}
        </section>
      </section>

      {blockPickerOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={() => setBlockPickerOpen(false)}>
          <section
            ref={pickerRef}
            className="block-picker"
            role="dialog"
            aria-modal="true"
            aria-label="New block"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="picker-title">new block</div>
            <div className="picker-options">
              {BLOCK_TYPES.map(({ type, label, Icon }, index) => (
                <button
                  key={type}
                  className={cx("picker-option", index === blockPickerIndex && "active")}
                  onClick={() => chooseBlockType(type)}
                  onMouseEnter={() => setBlockPickerIndex(index)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  <kbd>{index + 1}</kbd>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {shortcutsOpen && <ShortcutsOverlay refValue={shortcutsRef} onClose={() => setShortcutsOpen(false)} />}

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
            <span>{saving ? "saving" : dirty ? "modified" : "saved"}</span>
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

function AutoGrowTextarea({ value, onValueChange, onExitInsert, className = "", spellCheck = "true" }) {
  const textareaRef = useRef(null);

  const resize = useCallback(() => {
    const node = textareaRef.current;
    if (!node) {
      return;
    }
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [resize, value]);

  return (
    <textarea
      ref={textareaRef}
      autoFocus
      className={className}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
        window.requestAnimationFrame(resize);
      }}
      onInput={resize}
      onKeyDown={(event) =>
        handleTextControlKeyDown(event, {
          setValue: (nextValue) => {
            onValueChange(nextValue);
            window.requestAnimationFrame(resize);
          },
          multiline: true,
          onEscape: onExitInsert
        })
      }
      spellCheck={spellCheck}
    />
  );
}

function BlockView({
  block,
  index,
  selected,
  insertMode,
  onSelect,
  onInsert,
  onExitInsert,
  onUpdate,
  onUpdateMeta,
  onImageFile
}) {
  const fileInputRef = useRef(null);
  const latexHtml = useMemo(() => renderLatex(block.content), [block.content]);

  return (
    <article
      className={cx("block", selected && "selected", `block-${block.type}`)}
      onClick={onSelect}
      onDoubleClick={onInsert}
    >
      <div className="block-number">{String(index + 1).padStart(2, "0")}</div>
      <div className="block-body">
        {block.type === "text" && (
          insertMode ? (
            <AutoGrowTextarea
              value={block.content}
              onValueChange={(nextValue) => onUpdate({ content: nextValue })}
              onExitInsert={onExitInsert}
              spellCheck="true"
            />
          ) : (
            <div className="text-render">{block.content || "\u00a0"}</div>
          )
        )}

        {block.type === "latex" && (
          <>
            <div className="latex-render" dangerouslySetInnerHTML={{ __html: latexHtml }} />
            {insertMode && (
              <AutoGrowTextarea
                className="latex-source"
                value={block.content}
                onValueChange={(nextValue) => onUpdate({ content: nextValue })}
                onExitInsert={onExitInsert}
                spellCheck="false"
              />
            )}
          </>
        )}

        {block.type === "image" && (
          <div className="image-block">
            {block.content ? (
              <img src={block.content} alt={block.meta?.caption || block.meta?.name || "Image block"} />
            ) : (
              <button className="image-picker" onClick={() => fileInputRef.current?.click()}>
                <FileImage size={28} />
              </button>
            )}
            {insertMode && (
              <div className="image-controls">
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  <FileImage size={15} />
                  <span>{block.meta?.name || "choose"}</span>
                </button>
                <input
                  value={block.meta?.caption || ""}
                  onChange={(event) => onUpdateMeta({ caption: event.target.value })}
                  onKeyDown={(event) =>
                    handleTextControlKeyDown(event, {
                      setValue: (nextValue) => onUpdateMeta({ caption: nextValue }),
                      onEnter: onExitInsert,
                      onEscape: onExitInsert
                    })
                  }
                  placeholder="caption"
                />
              </div>
            )}
            {block.meta?.caption && <p className="caption">{block.meta.caption}</p>}
            <input
              ref={fileInputRef}
              className="hidden-file"
              type="file"
              accept="image/*"
              onChange={(event) => onImageFile(event.target.files?.[0])}
            />
          </div>
        )}
      </div>
    </article>
  );
}
