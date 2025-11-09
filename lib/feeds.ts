// lib/feeds.ts
export type Feed = { name: string; url: string };

export const FEEDS: Feed[] = [
  // Native RSS (keep as-is; freshness enforced in code)
  //{ name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  //{ name: "BBC UK", url: "https://feeds.bbci.co.uk/news/uk/rss.xml" },
  //{ name: "Politico EU", url: "https://www.politico.eu/feed/" },
  //{ name: "Politico US", url: "https://www.politico.com/rss/politics-news.xml" },

  // Google News feeds (recency + language/region filters are valid here)
  {
    name: "Reuters",
    url: "https://news.google.com/rss/search?q=when:12h+site:reuters.com&hl=en&gl=US&ceid=US:en",
  },
  //{
  //  name: "AP News",
  //  url: "https://news.google.com/rss/search?q=when:12h+site:apnews.com&hl=en&gl=US&ceid=US:en",
  //},
  {
    name: "Bloomberg",
    url: "https://news.google.com/rss/search?q=when:12h+allinurl:bloomberg.com&hl=en&gl=US&ceid=US:en",
  },

  // MarketWatch / Dow Jones
  {
    name: "MarketWatch Top Stories",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  },
  {
    name: "MarketWatch Breaking News Bulletins",
    url: "http://feeds.marketwatch.com/marketwatch/bulletins?_gl=1*1mogllm*_gcl_au*MTM3ODU5NjI4MC4xNzYyNzA4OTQx*_ga*MzEwNjQxMzUxLjE3NjI3MDg5NDE.*_ga_K2H7B9JRSS*czE3NjI3MDg5NDEkbzEkZzAkdDE3NjI3MDg5NDEkajYwJGwwJGgxMDkxMjU1MDQ5",
  },
  {
    name: "MarketWatch Market Pulse",
    url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
  },
  {
    name: "WSJ Markets News",
    url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
  },
  {
    name: "WSJ Economy News",
    url: "https://feeds.content.dowjones.io/public/rss/socialeconomyfeed",
  },

  // CNBC sections
  {
    name: "CNBC Finance News",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
  },
  {
    name: "CNBC Investing News",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258",
  },

  // Yahoo Finance
  { name: "Yahoo Finance", url: "https://news.yahoo.com/rss/finance" },
];
