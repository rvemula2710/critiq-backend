const express = require("express");
const cors = require("cors");
const Parser = require("rss-parser");
const translate = require("translate");

const app = express();
app.use(cors());

const parser = new Parser();
const PORT = process.env.PORT || 5000;

/* ===========================
   TRANSLATE SETUP
=========================== */
translate.engine = "google";
translate.key = null;

async function translateToEnglish(text) {
  try {
    if (!text) return "";
    return await translate(text, { to: "en" });
  } catch (err) {
    console.log("Translation error");
    return text;
  }
}

/* ===========================
   RSS SOURCES
=========================== */
const RSS_FEEDS = [
  "https://www.thehindu.com/news/national/feeder/default.rss",
  "https://www.deccanchronicle.com/rss_feed/"
];

/* ===========================
   FETCH RSS
=========================== */
async function fetchRSSFeeds() {
  let all = [];

  for (let url of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(url);

      const items = await Promise.all(
        feed.items.map(async item => ({
          title: await translateToEnglish(item.title),
          url: item.link,
          description: await translateToEnglish(item.contentSnippet),
          publishedAt: item.pubDate,
          source: { name: feed.title }
        }))
      );

      all = all.concat(items);

    } catch (err) {
      console.log("RSS error:", url);
    }
  }

  return all;
}

/* ===========================
   GOOGLE NEWS (TELUGU + LOCAL)
=========================== */
async function fetchGoogleNews(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const feed = await parser.parseURL(url);

    return await Promise.all(
      feed.items.map(async item => ({
        title: await translateToEnglish(item.title),
        url: item.link,
        description: await translateToEnglish(item.contentSnippet),
        publishedAt: item.pubDate,
        source: { name: "Google News" }
      }))
    );

  } catch (err) {
    console.log("Google fetch error:", query);
    return [];
  }
}

/* ===========================
   REMOVE DUPLICATES
=========================== */
function removeDuplicates(arr) {
  return Array.from(new Map(arr.map(a => [a.title, a])).values());
}

/* ===========================
   AI RANKING SYSTEM
=========================== */
function rankArticles(articles) {

  return articles.map(a => {

    let score = 0;
    const title = (a.title || "").toLowerCase();

    // 📍 LOCATION PRIORITY
    if (title.includes("hyderabad")) score += 50;
    if (title.includes("telangana")) score += 40;
    if (title.includes("india")) score += 30;

    // 🕒 RECENCY BOOST
    if (a.publishedAt) {
      const hours = (new Date() - new Date(a.publishedAt)) / (1000 * 60 * 60);
      score += Math.max(0, 30 - hours);
    }

    // 🔥 TREND KEYWORDS
    if (title.includes("breaking")) score += 20;
    if (title.includes("live")) score += 15;

    return { ...a, score };

  }).sort((a, b) => b.score - a.score);
}

/* ===========================
   MAIN NEWS API
=========================== */
app.get("/news", async (req, res) => {

  const query = req.query.q || "india";

  try {

    const rssData = await fetchRSSFeeds();
    const googleData = await fetchGoogleNews(query);

    const localNews = await fetchGoogleNews("hyderabad telangana news");
    const indiaNews = await fetchGoogleNews("india news");

    let all = [
      ...rssData,
      ...googleData,
      ...localNews,
      ...indiaNews
    ];

    const unique = removeDuplicates(all);
    const ranked = rankArticles(unique);

    res.json({ articles: ranked.slice(0, 50) });

  } catch (err) {
    console.log("Main API error");
    res.status(500).json({ error: "Server error" });
  }
});

/* ===========================
   TRENDING API (24 HOURS)
=========================== */
app.get("/trending", async (req, res) => {

  try {

    const queries = ["hyderabad", "telangana", "india", "world"];
    let all = [];

    for (let q of queries) {
      const data = await fetchGoogleNews(q);
      all = all.concat(data);
    }

    const now = new Date();

    let filtered = all.filter(a => {
      if (!a.publishedAt) return false;
      const diff = (now - new Date(a.publishedAt)) / (1000 * 60 * 60);
      return diff <= 24;
    });

    // fallback if empty
    if (filtered.length === 0) {
      filtered = all.slice(0, 20);
    }

    const ranked = rankArticles(filtered);

    res.json({ articles: ranked.slice(0, 30) });

  } catch (err) {
    console.log("Trending error");
    res.status(500).json({ error: "Server error" });
  }
});

/* ===========================
   ROOT CHECK
=========================== */
app.get("/", (req, res) => {
  res.send("Critiq Backend Running 🚀");
});

/* ===========================
   START SERVER
=========================== */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
