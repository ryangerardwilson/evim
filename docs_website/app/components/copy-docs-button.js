"use client";

import { useState } from "react";

export default function CopyDocsButton({ value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button className="copy-button" type="button" onClick={copy}>
      {copied ? "copied" : "copy"}
    </button>
  );
}
