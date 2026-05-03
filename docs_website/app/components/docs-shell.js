import CopyDocsButton from "./copy-docs-button";
import { docs, getDoc, site } from "../../lib/docs";

export default function DocsShell({ activeSlug }) {
  const active = getDoc(activeSlug);

  return (
    <main className="docs-scene">
      <section className="docs-shell" aria-label="evim documentation">
        <header className="docs-header">
          <div>
            <p className="kicker">{site.domain}</p>
            <h1>evim</h1>
          </div>
          <nav className="top-links" aria-label="Utility links">
            <a href={site.repoUrl}>github</a>
            <a href="/llms.txt">llms.txt</a>
          </nav>
        </header>

        <section className="docs-layout">
          <aside className="doc-tabs" aria-label="Documents">
            {docs.map((doc) => (
              <a
                key={doc.slug}
                className={doc.slug === active.slug ? "doc-tab active" : "doc-tab"}
                href={doc.slug === "readme" ? "/" : `/?doc=${doc.slug}`}
              >
                <span>{doc.eyebrow}</span>
                <strong>{doc.label}</strong>
                <em>{doc.summary}</em>
              </a>
            ))}
          </aside>

          <article className="doc-panel">
            <div className="doc-meta">
              <span>{active.label}</span>
              <div className="doc-actions">
                <a href={active.repoHref}>source</a>
                <CopyDocsButton value={active.content} />
              </div>
            </div>
            <pre className="doc-source">
              <code>{active.content}</code>
            </pre>
          </article>
        </section>
      </section>
    </main>
  );
}
