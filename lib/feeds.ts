// lib/feeds.ts
export type Feed = { name: string; url: string };

// Profile D: BBC, Reuters, AP, Politico EU + US
// Note: Some publishers change RSS endpoints or rate-limit.
// If a feed 403s, swap the URL for an alternative or add a lightweight proxy later.
export const FEEDS: Feed[] = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "BBC UK", url: "https://feeds.bbci.co.uk/news/uk/rss.xml" },
  {
    name: "Reuters World",
    url: "https://news.google.com/rss/search?q=site:reuters.com&hl=en-GB&gl=GB&ceid=GB:en",
  },
  {
    name: "AP Top",
    url: "https://rsshub.app/apnews/topics/ap-top-news",
  },
  { name: "Politico EU", url: "https://www.politico.eu/feed/" },
  {
    name: "Politico US",
    url: "https://www.politico.com/rss/politics-news.xml",
  },
];
