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
  const longName = fullText.find(name => name.includes(' '));
  return longName || fullText[0] || '';
}

function getFullFlagUrl(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  return `https://www.epbf.com${src.replace('..', '')}`;
}

function abbreviateSectionTitle(title) {
  if (!title) return '';
  const seMap = {
    "SE - Last 32": "L32",
    "SE - Last 16": "L16",
    "SE - Quarter Finals": "QF",
    "SE - Semi Finals": "SF",
    "SE - Final": "F"
  };

  if (seMap[title]) {
    return seMap[title];
  }

  let processedTitle = title;
  if (title.startsWith('SE - ')) {
    processedTitle = title.substring(5).trim();
  }

  processedTitle = processedTitle.replace(/\(.*?\)/g, '').trim();

  const words = processedTitle.split(/\s+/);
  let abbreviation = '';
  let collectedNumbers = '';
  words.forEach(word => {
    if (!word) return;
    if (/^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(word)) {
      abbreviation += word.charAt(0).toUpperCase();
    } else if (/^\d+(\/\d+)?$/.test(word)) {
      collectedNumbers += word;
    }
  });
  return abbreviation + collectedNumbers;
}

app.get('/score', async (req, res) => {
  try {
    const response = await axios.get(EPBF_URL);
    const $ = cheerio.load(response.data);

    let currentMatchData = {};
    let matchFound = false;
    const playerHistory = [];
    let currentSectionAbbreviation = '';
    let lastSeenSectionTitle = '';

    $('table tr').each((i, el) => {
      const tds = $(el).find('td');

      const roundNameCell = $(el).children('td.roundname[colspan="12"]');
      if (roundNameCell.length > 0) {
        const sectionTitle = roundNameCell.text().trim();
        currentSectionAbbreviation = abbreviateSectionTitle(sectionTitle);
        lastSeenSectionTitle = sectionTitle;
        return;
      }

      if (tds.length < 12) return;
      const rowMatchId = $(tds[0]).text().trim();

      if (!matchFound) {
        const rowText = $(el).text();
        if (rowText.includes(MATCH_ID)) {
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
      }

      if (PLAYER_ID && rowMatchId !== MATCH_ID) {
        const p1Cell = $(tds[4]);
        const p2Cell1 = $(tds[9]);
        const p2Cell2 = $(tds[10]);

        const p1Name = cleanPlayerName(p1Cell);
        const p2Name = cleanPlayerName(p2Cell1) || cleanPlayerName(p2Cell2);
        const p1Score = $(tds[6]).text().trim();
        const p2Score = $(tds[8]).text().trim();

        const p1Link = p1Cell.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0;
        const p2Link = p2Cell1.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0 || p2Cell2.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0;

        let historyEntry = null;
        if (p1Name && p2Name && p1Score !== '' && p2Score !== '') {
          if (p1Link && p2Name.toLowerCase() !== 'walkover') {
            historyEntry = `${p1Name} ${p1Score} - ${p2Score} ${p2Name}`;
          } else if (p2Link && p1Name.toLowerCase() !== 'walkover') {
            historyEntry = `${p2Name} ${p2Score} - ${p1Score} ${p1Name}`;
          }
        }

        if (historyEntry) {
          playerHistory.push(`${currentSectionAbbreviation}: ${historyEntry}`);

        }
      }
    });

    if (matchFound) {
      const responsePayload = { ...currentMatchData, playerHistory };
      res.json(responsePayload);
    } else {
      res.status(404).json({ error: 'Match not found' });
    }
  } catch (err) {
    console.error('Error in /score endpoint:', err.message);
    res.status(500).json({ error: 'Failed to fetch or parse data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
