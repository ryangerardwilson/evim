export function leftAlignedLatexRows(source) {
  const trimmed = String(source || "").trim();
  const match = trimmed.match(/^\\begin\{aligned\}\s*([\s\S]*?)\s*\\end\{aligned\}$/);
  if (!match) {
    return null;
  }

  return match[1]
    .split(/\\\\(?:\s*\[[^\]]*])?/g)
    .map((row) => row.replace(/&/g, "").trim())
    .filter(Boolean);
}
