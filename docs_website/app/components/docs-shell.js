import { DocsShell as SharedDocsShell } from "@ryangerardwilson/docs-shell";

import { docs, getDoc, site } from "../../lib/docs";

const utilityLinks = [
  {
    href: "https://ryangerardwilson.com/",
    label: "About the Author",
    kind: "button",
    newTab: true
  },
  {
    href: site.repoUrl,
    label: "GitHub",
    kind: "icon",
    icon: "github",
    newTab: true
  }
];

function docPayload() {
  return docs.map((doc) => {
    const source = getDoc(doc.slug);
    return {
      ...doc,
      title: doc.label,
      commandLabel: doc.label,
      content: source.content
    };
  });
}

export default function DocsShell({ activeSlug = "readme" }) {
  return (
    <SharedDocsShell
      initialSlug={activeSlug}
      docs={docPayload()}
      utilityLinks={utilityLinks}
      titleSuffix="evim docs"
    />
  );
}
