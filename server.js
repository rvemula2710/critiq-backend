const express = require("express");
const cors = require("cors");
const Parser = require("rss-parser");

const app = express();
app.use(cors());

const parser = new Parser();
const PORT = process.env.PORT || 5000;

/* GOOGLE NEWS (FAST) */
async function fetchGoogleNews(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const feed = await parser.parseURL(url);

    return feed.items.map(item => ({
      title: item.title,
      url: item.link,
      description: item.contentSnippet,
      publishedAt: item.pubDate,
      urlToImage: null // keep simple
    }));

  } catch (err) {
    return [];
  }
}

/* NEWS API */
app.get("/news", async (req, res) => {

  const query = req.query.q || "india";

  const data = await fetchGoogleNews(query);

  res.json({ articles: data.slice(0, 30) });
});

/* TRENDING API */
app.get("/trending", async (req, res) => {

  const queries = ["hyderabad", "telangana", "india"];
  let all = [];

  for (let q of queries) {
    const data = await fetchGoogleNews(q);
    all = all.concat(data);
  }

  res.json({ articles: all.slice(0, 30) });
});

/* ROOT */
app.get("/", (req, res) => {
  res.send("Critiq Backend Running 🚀");
});

app.listen(PORT, () => {
  console.log("Server running");
});
