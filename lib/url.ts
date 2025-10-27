// lib/url.ts
import crypto from "crypto";

export function getDomain(href: string): string | null {
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function urlHash(href: string): string {
  return crypto.createHash("sha256").update(href.trim()).digest("hex");
}
