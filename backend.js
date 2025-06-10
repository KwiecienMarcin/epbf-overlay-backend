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
    "SE - Last 32 (L32)": "L32",
    "SE - Last 16 (L16)": "L16",
    "SE - Quarter Finals (QF)": "QF",
    "SE - Semi Finals (SF)": "SF",
    "SE - Final (F)": "F"
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
  //const { playerId } = req.query; // Expecting ?playerId=XXXX
  try {
    const response = await axios.get(EPBF_URL);
    const $ = cheerio.load(response.data);

    let currentMatchData = {};
    let matchFound = false;
    const playerHistory = [];
    let currentSectionAbbreviation = ''; // To store the abbreviation of the current round


    $('table tr').each((i, el) => {
      const tds = $(el).find('td');
      // Check for section header row FIRST (e.g., "Winners Round 1")
      // These typically have a single td with class "roundname" and colspan="12"
      const roundNameCell = $(el).children('td.roundname[colspan="12"]');
      if (roundNameCell.length > 0) {
        const sectionTitle = roundNameCell.text().trim();
        currentSectionAbbreviation = abbreviateSectionTitle(sectionTitle);
                // console.log(`Found round header: '${sectionTitle}', Abbreviation: '${currentSectionAbbreviation}'`); // Optional: for debugging

        return; // This row is a header, skip further match processing for this row
      }

      // Ensure row has enough cells for parsing a match row
      if (tds.length < 12) return;
      const rowMatchId = $(tds[0]).text().trim(); // Get match ID from the first cell of the row

      // 1. Current match data (based on hardcoded MATCH_ID)
      if (!matchFound) { // Only process if current match not yet found
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

// 2. Player history (using global PLAYER_ID)
      if (PLAYER_ID && rowMatchId !== MATCH_ID) { // Exclude the current live match from history
        const p1Cell = $(tds[4]);
        const p2CellForNameLogic1 = $(tds[9]); // Primary cell for player 2 name/link
        const p2CellForNameLogic2 = $(tds[10]); // Alternative cell for player 2 name/link

        const p1Name = cleanPlayerName(p1Cell);
        const p1Score = $(tds[6]).text().trim();
        const p2Score = $(tds[8]).text().trim();
        const p2Name = cleanPlayerName(p2CellForNameLogic1) || cleanPlayerName(p2CellForNameLogic2);

        // Check if the current row is for the tracked player
const p1LinkFound = p1Cell.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0;
        const p2LinkFound = p2CellForNameLogic1.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0 ||
                            p2CellForNameLogic2.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0;
        
        let historyEntry = null;
        if (p1Name && p2Name && p1Score !== '' && p2Score !== '') { // Basic check for valid data
            if (p1LinkFound && p2Name.toLowerCase() !== 'walkover') {
                historyEntry = `${p1Name} ${p1Score} - ${p2Score} ${p2Name}`;
            } else if (p2LinkFound && p1Name.toLowerCase() !== 'walkover') {
                historyEntry = `${p2Name} ${p2Score} - ${p1Score} ${p1Name}`;
            }
        }
        
        if (historyEntry) {
            playerHistory.push(`${currentSectionAbbreviation}: ${historyEntry}`); // Always include abbreviation and colon
        }
      }
    });

if (matchFound) {
      const responsePayload = { ...currentMatchData };
      responsePayload.playerHistory = playerHistory; // Add history (will be empty if no matches or PLAYER_ID not set)

      res.json(responsePayload);
    } else {
      res.status(404).json({ error: 'Match not found' });
    }
  } catch (err) {
    console.error('Error in /score endpoint:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch or parse data', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
