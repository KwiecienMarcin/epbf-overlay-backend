const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const EPBF_URL = 'https://www.epbf.com/tournaments/european-championships/live/1320/draw-results/';
const MATCH_ID = 'A094';

function cleanPlayerName(cell) {
  const fullText = cell.text().trim().split('\n').map(s => s.trim()).filter(Boolean);
  const longName = fullText.find(name => name.includes(' ')); // zawiera imię i nazwisko
  return longName || fullText[0] || '';
}

function getFullFlagUrl(src) {
  if (!src) return '';
  const relativePath = src.replace('..', '');
  if (relativePath.startsWith('https://')) return relativePath;
  return `https://www.epbf.com${relativePath}`;
}

app.get('/score', async (req, res) => {
  try {
    const response = await axios.get(EPBF_URL);
    const $ = cheerio.load(response.data);

    let result = {};
    let found = false;

    $('table tr').each((i, el) => {
      const rowText = $(el).text();
      if (rowText.includes(MATCH_ID)) {
        const tds = $(el).find('td');
        if (tds.length >= 12) {
          result = {
            matchId: MATCH_ID,
            raceTo: $(tds[3]).text().trim(),
            player1: cleanPlayerName($(tds[4])),
            flag1: getFullFlagUrl($(tds[5]).find('img').attr('src')),
            score1: $(tds[6]).text().trim(),
            score2: $(tds[7]).text().trim(),
            flag2: getFullFlagUrl($(tds[8]).find('img').attr('src'))
              || getFullFlagUrl($(tds[9]).find('img').attr('src'))
              || getFullFlagUrl($(tds[10]).find('img').attr('src')),
            player2: cleanPlayerName($(tds[9])) || cleanPlayerName($(tds[10])),
            table: $(tds[11]).text().trim()
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
