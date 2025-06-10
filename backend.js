const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const EPBF_URL = 'https://www.epbf.com/tournaments/eurotour/id/1334/draw-results/';
const MATCH_ID = 'SE20';
const PLAYER_ID = '3355';

function cleanPlayerName(cell) {
  const fullText = cell.text().trim().split('\n').map(s => s.trim()).filter(Boolean);
  return fullText.find(name => name.includes(' ')) || fullText[0] || '';
}

function getFullFlagUrl(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  return `https://www.epbf.com${src.replace('..', '')}`;
}

function abbreviateSectionTitle(title) {
  const roundMap = {
    "Round 1": "R1",
    "Winners Round 1": "WR1",
    "Winners Round 2": "WR2",
    "Winners Qualification": "WQ",
    "Losers Round 1": "LR1",
    "Losers Round 2": "LR2",
    "Losers Round 3": "LR3",
    "Losers Round 4": "LR4",
    "Losers Round 5": "LR5",
    "Losers Qualification": "LQ",
    "SE - Last 32": "L32",
    "SE - Last 16": "L16",
    "SE - Quarter Finals": "QF",
    "SE - Semi Finals": "SF",
    "SE - Final": "F"
  };
  return roundMap[title.trim()] || title.trim();
}

app.get('/score', async (req, res) => {
  try {
    const response = await axios.get(EPBF_URL);
    const $ = cheerio.load(response.data);

    const playerHistory = [];
    let currentMatchData = {};
    let matchFound = false;

    $('h3.h3').each((_, h3Elem) => {
      const roundTitle = $(h3Elem).text().trim();
      const roundAbbreviation = abbreviateSectionTitle(roundTitle);
      const table = $(h3Elem).next('table');

      table.find('tr').each((_, el) => {
        const tds = $(el).find('td');
        if (tds.length < 12) return;
        const rowMatchId = $(tds[0]).text().trim();

        // Znalezienie bieżącego meczu
        if (!matchFound && $(el).text().includes(MATCH_ID)) {
          currentMatchData = {
            matchId: MATCH_ID,
            raceTo: $(tds[3]).text().trim(),
            player1: cleanPlayerName($(tds[4])),
            flag1: getFullFlagUrl($(tds[5]).find('img').attr('src')),
            score1: $(tds[6]).text().trim(),
            score2: $(tds[8]).text().trim(),
            flag2: getFullFlagUrl($(tds[8]).find('img').attr('src'))
              || getFullFlagUrl($(tds[9]).find('img').attr('src'))
              || getFullFlagUrl($(tds[10]).find('img').attr('src')),
            player2: cleanPlayerName($(tds[9])) || cleanPlayerName($(tds[10])),
            table: $(tds[11]).text().trim()
          };
          matchFound = true;
        }

        // Historia gracza
        if (PLAYER_ID && rowMatchId !== MATCH_ID) {
          const p1Cell = $(tds[4]);
          const p2Cell1 = $(tds[9]);
          const p2Cell2 = $(tds[10]);

          const p1Name = cleanPlayerName(p1Cell);
          const p1Score = $(tds[6]).text().trim();
          const p2Score = $(tds[8]).text().trim();
          const p2Name = cleanPlayerName(p2Cell1) || cleanPlayerName(p2Cell2);

          const p1Link = p1Cell.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0;
          const p2Link = p2Cell1.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0 ||
                         p2Cell2.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0;

          if (p1Name && p2Name && p1Score !== '' && p2Score !== '') {
            let entry = null;
            if (p1Link && p2Name.toLowerCase() !== 'walkover') {
              entry = `${p1Name} ${p1Score} - ${p2Score} ${p2Name}`;
            } else if (p2Link && p1Name.toLowerCase() !== 'walkover') {
              entry = `${p2Name} ${p2Score} - ${p1Score} ${p1Name}`;
            }
            if (entry) playerHistory.push(`${roundAbbreviation}: ${entry}`);
          }
        }
      });
    });

    if (matchFound) {
      res.json({ ...currentMatchData, playerHistory });
    } else {
      res.status(404).json({ error: 'Match not found' });
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
