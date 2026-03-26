const express = require("express");
const cors = require("cors");
const Parser = require("rss-parser");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(cors());

const parser = new Parser();
const PORT = process.env.PORT || 5000;

/* ===========================
   EXTRACT IMAGE FROM ARTICLE
=========================== */
async function extractImageFromPage(url) {
  try {
    const { data } = await axios.get(url, { timeout: 5000 });
    const $ = cheerio.load(data);

    // ✅ Best source
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) return ogImage;

    // fallback
    const img = $("img").first().attr("src");
    return img || null;

  } catch (err) {
    return null;
  }
}

/* ===========================
   EXTRACT IMAGE FROM RSS
=========================== */
function extractImage(item) {
  return (
    item.enclosure?.url ||
    item.media?.content?.url ||
    item.media?.thumbnail?.url ||
    (item.content && item.content.match(/<img.*?src="(.*?)"/)?.[1]) ||
    null
  );
}

/* ===========================
   CLEAN TEXT
=========================== */
function cleanText(text) {
  return text?.replace(/<[^>]+>/g, "") || "";
}

/* ===========================
   GOOGLE NEWS
=========================== */
async function fetchGoogleNews(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const feed = await parser.parseURL(url);

    return await Promise.all(feed.items.map(async item => {

      let image = extractImage(item);

      // 🔥 If no image → scrape article
      if (!image && item.link) {
        image = await extractImageFromPage(item.link);
      }

      return {
        title: cleanText(item.title),
        url: item.link,
        description: cleanText(item.contentSnippet),
        publishedAt: item.pubDate,
        urlToImage: image
      };

    }));

  } catch (err) {
    console.log("Google error:", query);
    return [];
  }
}

/* ===========================
   RSS SOURCES
=========================== */
const RSS_FEEDS = [
  "https://www.thehindu.com/news/national/feeder/default.rss",
  "https://www.deccanchronicle.com/rss_feed/"
];

async function fetchRSSFeeds() {
  let all = [];

  for (let url of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(url);

      const items = await Promise.all(feed.items.map(async item => {

        let image = extractImage(item);

        if (!image && item.link) {
          image = await extractImageFromPage(item.link);
        }

        return {
          title: cleanText(item.title),
          url: item.link,
          description: cleanText(item.contentSnippet),
          publishedAt: item.pubDate,
          urlToImage: image
        };

      }));

      all = all.concat(items);

    } catch (err) {
      console.log("RSS error:", url);
    }
  }

  return all;
}

/* ===========================
   REMOVE DUPLICATES
=========================== */
function removeDuplicates(arr) {
  return Array.from(new Map(arr.map(a => [a.title, a])).values());
}

/* ===========================
   NEWS API
=========================== */
app.get("/news", async (req, res) => {

  const query = req.query.q || "india";

  try {

    const google = await fetchGoogleNews(query);
    const rss = await fetchRSSFeeds();
    const local = await fetchGoogleNews("hyderabad telangana news");

    let all = [...google, ...rss, ...local];

    const unique = removeDuplicates(all);

    res.json({ articles: unique.slice(0, 30) });

  } catch (err) {
    res.status(500).json({ error: "News fetch failed" });
  }
});

/* ===========================
   TRENDING API
=========================== */
app.get("/trending", async (req, res) => {

  try {

    const queries = ["hyderabad", "telangana", "india"];
    let all = [];

    for (let q of queries) {
      const data = await fetchGoogleNews(q);
      all = all.concat(data);
    }

    const unique = removeDuplicates(all);

    res.json({ articles: unique.slice(0, 30) });

  } catch (err) {
    res.status(500).json({ error: "Trending failed" });
  }
});

/* ===========================
   ROOT
=========================== */
app.get("/", (req, res) => {
  res.send("Critiq Backend Running 🚀");
});

/* ===========================
   START SERVER
=========================== */
app.listen(PORT, () => {
  console.log("Server running");
});
