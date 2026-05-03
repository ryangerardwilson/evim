import DocsShell from "./components/docs-shell";

export default async function Page({ searchParams }) {
  const params = await searchParams;
  return <DocsShell activeSlug={params?.doc || "readme"} />;
}
