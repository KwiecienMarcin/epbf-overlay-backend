const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const EPBF_URL = 'https://www.epbf.com/tournaments/eurotour/id/1334/draw-results/';
const MATCH_ID = 'SE20';
const PLAYER_ID = '3355'; // Hardcoded Player ID

function cleanPlayerName(cell) {
  const fullText = cell.text().trim().split('\n').map(s => s.trim()).filter(Boolean);
  const longName = fullText.find(name => name.includes(' ')); // zawiera imię i nazwisko
  return longName || fullText[0] || '';
}

function getFullFlagUrl(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src; // already full
    return `https://www.epbf.com${src.replace('..', '')}`;
}

function abbreviateSectionTitle(title) {
  if (!title) return '';
 // Specific mappings for "SE - " titles based on user's desired output (often from parentheses)
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
  // If it's an SE title not caught by the map, strip "SE - " for general processing
  if (title.startsWith('SE - ')) {
    processedTitle = title.substring(5).trim();
  }

  // Remove any other content within parentheses for general processing
  processedTitle = processedTitle.replace(/\(.*?\)/g, '').trim();

  const words = processedTitle.split(/\s+/);
  let abbreviation = '';
  let collectedNumbers = '';
  words.forEach(word => {
    if (!word) return; // Skip empty words if any

    // Check if the word is purely alphabetic (allows hyphens like in "Semi-Finals")
    if (/^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(word)) {

      abbreviation += word.charAt(0).toUpperCase();
    } 
    // Check if the word is purely numeric or a fraction
    else if (/^\d+(\/\d+)?$/.test(word)) {
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

    $('h3.h3').each((i, el) => {
      const sectionTitle = $(el).text().trim();
      const sectionAbbrev = abbreviateSectionTitle(sectionTitle);
      const table = $(el).next('table');

      table.find('tr').each((j, row) => {
        const tds = $(row).find('td');
        if (tds.length < 12) return;

        const rowMatchId = $(tds[0]).text().trim();

        // 1. Szukaj aktualnego meczu
        if (!matchFound && rowMatchId === MATCH_ID) {
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

        // 2. Historia gracza
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
          if (p1Link && p2Name.toLowerCase() !== 'walkover') {
            historyEntry = `${p1Name} ${p1Score} - ${p2Score} ${p2Name}`;
          } else if (p2Link && p1Name.toLowerCase() !== 'walkover') {
            historyEntry = `${p2Name} ${p2Score} - ${p1Score} ${p1Name}`;
          }

          if (historyEntry) {
            playerHistory.push(`${sectionAbbrev}: ${historyEntry}`);
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
    console.error('Error in /score:', err.message);
    res.status(500).json({ error: 'Failed to fetch or parse data' });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});