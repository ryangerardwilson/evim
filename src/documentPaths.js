export function slugifyTitle(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "document";
}

export function hasDocumentExtension(value) {
  return /\.md$/i.test(String(value || ""));
}

export function documentFileNameFromName(value) {
  const rawName = String(value || "").trim();
  const baseName = rawName.split(/[\\/]/).filter(Boolean).pop() || "document";
  if (/\.md$/i.test(baseName)) {
    return baseName;
  }
  return `${slugifyTitle(baseName)}.md`;
}

export function documentTitleFromPath(value) {
  const rawPath = String(value || "").trim();
  const baseName = rawPath.split(/[\\/]/).filter(Boolean).pop() || "document";
  return baseName.replace(/\.md$/i, "").replace(/[-_]+/g, " ") || "document";
}

export function suggestedDocumentPath(title) {
  return documentFileNameFromName(title);
}

export function resolveNamedDocumentPath(name, rawPath) {
  const fileName = documentFileNameFromName(name);
  const value = String(rawPath || "").trim();
  if (!value) {
    return fileName;
  }
  if (hasDocumentExtension(value)) {
    return value;
  }
  return `${value.replace(/[\\/]+$/, "")}/${fileName}`;
}
