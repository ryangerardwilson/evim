function fallbackTitleFromSlug(slug) {
  const lastSegment = String(slug || "note")
    .split("/")
    .filter(Boolean)
    .pop() || "note";
  return lastSegment
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function cleanRelativePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

function cleanSlug(value) {
  return cleanRelativePath(value)
    .replace(/\.md$/i, "")
    .replace(/\/index$/i, "")
    .replace(/^index$/i, "");
}

function ensureLeadingSlash(value) {
  const cleaned = cleanRelativePath(value);
  return `/${cleaned}`.replace(/\/+$/, "") || "/";
}

export function titleFromMarkdown(markdown, fallback = "note") {
  const title = String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^#\s+(.+)$/)?.[1]?.trim())
    .find(Boolean);
  return title || fallbackTitleFromSlug(fallback);
}

export function noteEntryFromMarkdownFile({ relativePath, markdown, contentBase = "/content" } = {}) {
  const relative = cleanRelativePath(relativePath);
  const slug = cleanSlug(relative);
  return {
    slug,
    title: titleFromMarkdown(markdown, slug),
    source: ensureLeadingSlash(`${contentBase}/${relative}`),
    href: slug ? ensureLeadingSlash(slug) : "/"
  };
}

export function normalizeNoteEntry(entry = {}) {
  const slug = cleanSlug(entry.slug || entry.href || entry.source || "");
  const segments = slug.split("/").filter(Boolean);
  const group = segments.length > 1 ? segments.slice(0, -1).join("/") : "notes";
  return {
    slug,
    title: String(entry.title || fallbackTitleFromSlug(slug)).trim(),
    source: entry.source || ensureLeadingSlash(`content/${slug}.md`),
    href: entry.href || (slug ? ensureLeadingSlash(slug) : "/"),
    group,
    segments
  };
}

export function organizeNoteIndex(entries = []) {
  const notes = entries
    .map((entry) => normalizeNoteEntry(entry))
    .filter((entry) => entry.slug)
    .sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug))
    .map((entry, index) => ({ ...entry, index }));

  const groups = [];
  for (const note of notes) {
    let group = groups[groups.length - 1];
    if (!group || group.key !== note.group) {
      group = {
        key: note.group,
        title: note.group === "notes" ? "notes" : note.group,
        notes: []
      };
      groups.push(group);
    }
    group.notes.push(note);
  }

  return { notes, groups };
}

export function selectedNoteIndex(noteIndex, slug) {
  const notes = Array.isArray(noteIndex) ? noteIndex : noteIndex?.notes || [];
  const index = notes.findIndex((note) => note.slug === slug);
  return index >= 0 ? index : 0;
}

export function moveNoteIndexSelection(currentIndex, direction, noteIndex) {
  const notes = Array.isArray(noteIndex) ? noteIndex : noteIndex?.notes || [];
  if (!notes.length) {
    return 0;
  }
  const current = Number.isFinite(currentIndex) ? currentIndex : 0;
  const next = current + Math.sign(direction || 0);
  return Math.max(0, Math.min(notes.length - 1, next));
}

export function noteAtIndexSelection(noteIndex, selectedIndex) {
  const notes = Array.isArray(noteIndex) ? noteIndex : noteIndex?.notes || [];
  return notes[Math.max(0, Math.min(notes.length - 1, selectedIndex))] || null;
}
