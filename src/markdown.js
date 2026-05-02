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

function lineNumbers(startLine, count) {
  return Array.from({ length: Math.max(1, count) }, (_, index) => startLine + index);
}

export function parseMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const nodes = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const sourceLine = index + 1;

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
      nodes.push({
        type: "code",
        line: sourceLine,
        lineNumbers: lineNumbers(sourceLine + 1, codeLines.length),
        lines: codeLines,
        language,
        value: codeLines.join("\n")
      });
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
      nodes.push({
        type: "latex",
        line: sourceLine,
        lineNumbers: lineNumbers(sourceLine, index - sourceLine + 1),
        value: latexLines.join("\n").trim()
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      nodes.push({ type: "heading", line: sourceLine, level: heading[1].length, value: heading[2] });
      index += 1;
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]+)")?\)\s*$/);
    if (image) {
      nodes.push({ type: "image", line: sourceLine, alt: image[1], src: image[2], title: image[3] || "" });
      index += 1;
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      nodes.push({ type: "rule", line: sourceLine });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push({
        type: "quote",
        line: sourceLine,
        lineNumbers: lineNumbers(sourceLine, quoteLines.length),
        lines: quoteLines,
        value: quoteLines.join("\n")
      });
      continue;
    }

    if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
      const items = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (index < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[index])) {
        const match = lines[index].match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
        items.push({
          line: index + 1,
          marker: match?.[2] || (ordered ? `${items.length + 1}.` : "-"),
          value: match?.[3] || ""
        });
        index += 1;
      }
      nodes.push({ type: "list", line: sourceLine, ordered, items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && !isMarkdownBoundary(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    nodes.push({
      type: "paragraph",
      line: sourceLine,
      lineNumbers: lineNumbers(sourceLine, paragraphLines.length),
      lines: paragraphLines,
      value: paragraphLines.join("\n")
    });
  }

  return nodes;
}

export function headingIndexFromNodes(nodes) {
  const stack = [];
  return nodes
    .filter((node) => node.type === "heading")
    .map((node, index) => {
      while (stack.length && stack[stack.length - 1] >= node.level) {
        stack.pop();
      }
      const depth = stack.length;
      stack.push(node.level);
      return {
        id: `${node.line}-${index}`,
        line: node.line,
        level: node.level,
        depth,
        title: node.value
      };
    });
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
