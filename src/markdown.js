function isMarkdownBoundary(line) {
  return (
    !line.trim() ||
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^\$\$/.test(line.trim()) ||
    /^!\[[^\]]*]\([^)]+\)\s*$/.test(line.trim()) ||
    /^>\s?/.test(line) ||
    /^[-*_]{3,}\s*$/.test(line.trim()) ||
    /^(\s*)([-*+]|\d+\.)\s+/.test(line)
  );
}

export function parseMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const nodes = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.replace(/^```/, "").trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      nodes.push({ type: "code", language, value: codeLines.join("\n") });
      continue;
    }

    if (/^\$\$/.test(trimmed)) {
      const latexLines = [];
      const first = trimmed.replace(/^\$\$/, "");
      if (first.endsWith("$$") && first.length > 2) {
        latexLines.push(first.replace(/\$\$$/, ""));
        index += 1;
      } else {
        if (first) {
          latexLines.push(first);
        }
        index += 1;
        while (index < lines.length && !/\$\$\s*$/.test(lines[index])) {
          latexLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          latexLines.push(lines[index].replace(/\$\$\s*$/, ""));
          index += 1;
        }
      }
      nodes.push({ type: "latex", value: latexLines.join("\n").trim() });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      nodes.push({ type: "heading", level: heading[1].length, value: heading[2] });
      index += 1;
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]+)")?\)\s*$/);
    if (image) {
      nodes.push({ type: "image", alt: image[1], src: image[2], title: image[3] || "" });
      index += 1;
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      nodes.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push({ type: "quote", value: quoteLines.join("\n") });
      continue;
    }

    if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
      const items = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (index < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^(\s*)([-*+]|\d+\.)\s+/, ""));
        index += 1;
      }
      nodes.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && !isMarkdownBoundary(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    nodes.push({ type: "paragraph", value: paragraphLines.join("\n") });
  }

  return nodes;
}

export function inlineParts(value) {
  const parts = [];
  const source = String(value || "");
  const pattern = /(`[^`]+`|\$[^$\n]+\$)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(source))) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: source.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push({ type: "code", value: token.slice(1, -1) });
    } else {
      parts.push({ type: "math", value: token.slice(1, -1) });
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < source.length) {
    parts.push({ type: "text", value: source.slice(lastIndex) });
  }
  return parts;
}
