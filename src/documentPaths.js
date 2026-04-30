export function slugifyTitle(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "document";
}

export function hasDocumentExtension(value) {
  return /\.bvim(?:\.json)?$/i.test(String(value || "")) || /\.json$/i.test(String(value || ""));
}

export function documentFileNameFromName(value) {
  const rawName = String(value || "").trim();
  const baseName = rawName.split(/[\\/]/).filter(Boolean).pop() || "document";
  if (/\.bvim(?:\.json)?$/i.test(baseName)) {
    return baseName;
  }
  if (/\.json$/i.test(baseName)) {
    return baseName.replace(/\.json$/i, ".bvim");
  }
  return `${slugifyTitle(baseName)}.bvim`;
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
