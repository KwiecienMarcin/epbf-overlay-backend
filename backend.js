const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const EPBF_URL = 'https://www.epbf.com/tournaments/eurotour/id/1334/draw-results/';
const PLAYER_ID = '3231'; // Zahardkodowane ID gracza

function cleanPlayerName(cell) {
  const fullText = cell.text().trim().split('\n').map(s => s.trim()).filter(Boolean);
  const longName = fullText.find(name => name.includes(' '));
  return longName || fullText[0] || '';
}

function getFullFlagUrl(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  return `https://www.epbf.com${src.replace('..', '')}`;
}

app.get('/score', async (req, res) => {
  try {
    const response = await axios.get(EPBF_URL);
    const $ = cheerio.load(response.data);

    const playerMatches = [];
    let currentRound = '';

    $('tbody').each((i, tbody) => {
      const isRoundHeadline = $(tbody).hasClass('round_headline');
      const isMatchTable = $(tbody).hasClass('round_table');

      if (isRoundHeadline) {
        const roundName = $(tbody).find('h3.h3').text().trim();
        if (roundName) {
          currentRound = roundName;
        }
      }

      if (isMatchTable) {
        $(tbody).find('tr').each((i, el) => {
          const tds = $(el).find('td');
          if (tds.length < 12) return;

          const p1Cell = $(tds[4]);
          const p2Cell = $(tds[9]).length ? $(tds[9]) : $(tds[10]);

          const p1Href = p1Cell.find('a').attr('href') || '';
          const p2Href = p2Cell.find('a').attr('href') || '';

          const p1Id = p1Href.match(/player\/show\/(\d+)\//)?.[1];
          const p2Id = p2Href.match(/player\/show\/(\d+)\//)?.[1];

          if (p1Id !== PLAYER_ID && p2Id !== PLAYER_ID) return;


          const player1 = cleanPlayerName(p1Cell);
          const player2 = cleanPlayerName(p2Cell);
          const score1 = $(tds[6]).text().trim();
          const score2 = $(tds[8]).text().trim();
          const raceTo = $(tds[3]).text().trim();
          const table = $(tds[11]).text().trim();
          const flag1 = getFullFlagUrl($(tds[5]).find('img').attr('src'));
          const flag2 = getFullFlagUrl($(tds[10]).find('img').attr('src')) || getFullFlagUrl($(tds[9]).find('img').attr('src'));

          const time = $(tds[1]).find('span.d-none.d-sm-block').text().trim();
          const matchId = $(tds[0]).text().trim();

          if (!player1 || !player2 || score1 === '' || score2 === '') return;

          if (
            player1.toLowerCase().includes('walkover') ||
            player2.toLowerCase().includes('walkover')
          ) return;

          playerMatches.push({
            player1,
            player2,
            score1,
            score2,
            raceTo,
            table,
            flag1,
            flag2,
            time,
            matchId,
            round: currentRound
          });
        });
      }
    });

    if (playerMatches.length === 0) {
      return res.status(404).json({ error: 'No matches found for player' });
    }

    return res.json({ allMatches: playerMatches });
  } catch (err) {
    console.error('Error in /score endpoint:', err.message);
    res.status(500).json({ error: 'Failed to fetch or parse data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
