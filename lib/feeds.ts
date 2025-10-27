// lib/feeds.ts
export type Feed = { name: string; url: string };

// Profile D: BBC, Reuters, AP, Politico EU + US
// Note: Some publishers change RSS endpoints or rate-limit.
// If a feed 403s, swap the URL for an alternative or add a lightweight proxy later.
export const FEEDS: Feed[] = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "BBC UK", url: "https://feeds.bbci.co.uk/news/uk/rss.xml" },
  {
    name: "Reuters",
    url: "https://news.google.com/rss/search?q=when:12h+site:reuters.com&hl=en&gl=US&ceid=US:en",
  },
  {
    name: "AP News",
    url: "https://news.google.com/rss/search?q=when:12h+site:apnews.com&hl=en&gl=US&ceid=US:e",
  },
  { name: "Politico EU", url: "https://www.politico.eu/feed/" },
  {
    name: "Politico US",
    url: "https://www.politico.com/rss/politics-news.xml",
  },
  {
    name: "Bloomberg",
    url: "https://news.google.com/rss/search?q=when:12h+allinurl:bloomberg.com&hl=en&gl=US&ceid=US:en",
  },
];
