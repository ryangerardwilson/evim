import "@ryangerardwilson/docs-shell/styles.css";
import "./globals.css";

export const metadata = {
  title: "evim docs",
  description: "Documentation for evim, a Vim-backed local Markdown previewer."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
