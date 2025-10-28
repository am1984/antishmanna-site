import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export async function extractFullText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) antishmanna-site/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article || !article.textContent) return null;

    // Clean + normalize whitespace
    return article.textContent.replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}
