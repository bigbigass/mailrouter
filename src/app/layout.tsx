import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verification Mailboxes",
  description: "Manage Cloudflare-routed verification email addresses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
