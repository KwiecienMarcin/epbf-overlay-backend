const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');
app.use(cors());

const EPBF_URL = 'https://www.epbf.com/tournaments/european-championships/live/1320/draw-results/';
const MATCH_ID = 'A095'; // <- Tylko ten mecz

app.get('/score', async (req, res) => {
  try {
    const response = await axios.get(EPBF_URL);
    const $ = cheerio.load(response.data);

    let found = false;
    let result = {};

    $('table tr').each((i, el) => {
      const rowText = $(el).text();
      if (rowText.includes(MATCH_ID)) {
        const tds = $(el).find('td');
        if (tds.length >= 10) {
          result = {
            matchId: MATCH_ID,
            raceTo: $(tds[3]).text().trim(),
            player1: $(tds[4]).text().trim(),
            flag1: $(tds[5]).find('img').attr('src')?.split('/').pop().replace('.png', '') || '',
            score1: $(tds[6]).text().trim(),
            score2: $(tds[7]).text().trim(),
            flag2: $(tds[8]).find('img').attr('src')?.split('/').pop().replace('.png', '') || '',
            player2: $(tds[9]).text().trim(),
            table: $(tds[10]).text().trim()
          };
          found = true;
        }
      }
    });

    if (found) {
      res.json(result);
    } else {
      res.status(404).json({ error: 'Match not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch or parse data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});