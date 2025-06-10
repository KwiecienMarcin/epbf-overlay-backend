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

  // Specific mappings for "SE - " titles.
  // Keys should exactly match the text content of the h3.h3 elements.
  const seMap = {
    "SE - Last 32": "L32", // Assuming h3 text is "SE - Last 32"
    "SE - Last 16": "L16", // Assuming h3 text is "SE - Last 16"
    "SE - Quarter Finals": "QF",
    "SE - Semi Finals": "SF",
    "SE - Final": "F"
    // Add other specific SE titles if they appear differently on the page
  };

  // Check if the exact title (potentially including parentheses if they are in the h3) is in the map
  if (seMap[title]) {
    return seMap[title];
  }
  // Check if a version of the title without parentheses is in the map
  const titleWithoutParentheses = title.replace(/\(.*?\)/g, '').trim();
  if (seMap[titleWithoutParentheses]) {
    return seMap[titleWithoutParentheses];
  }


  let processedTitle = title;
  // If it's an SE title not caught by the map, strip "SE - " for general processing
  if (processedTitle.startsWith('SE - ')) {
    processedTitle = processedTitle.substring(5).trim();
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
    let currentSectionAbbreviation = '';

    // --- Pass 1: Find the current match (MATCH_ID) ---
    // This iterates all tables to ensure the current match is found.
    $('table tr').each((idx, tableRowElement) => {
        if (matchFound) return false; // Stop iterating if already found

        const $tableRow = $(tableRowElement);
        const cells = $tableRow.find('td');

        if (cells.length < 12) return; // Skip rows not matching match structure

        const rowTextContent = $tableRow.text();
        if (rowTextContent.includes(MATCH_ID)) {
            currentMatchData = {
                matchId: MATCH_ID,
                raceTo: $(cells[3]).text().trim(),
                player1: cleanPlayerName($(cells[4])),
                flag1: getFullFlagUrl($(cells[5]).find('img').attr('src')),
                score1: $(cells[6]).text().trim(),
                score2: $(cells[8]).text().trim(),
                flag2: getFullFlagUrl($(cells[8]).find('img').attr('src'))
                        || getFullFlagUrl($(cells[9]).find('img').attr('src'))
                        || getFullFlagUrl($(cells[10]).find('img').attr('src')),
                player2: cleanPlayerName($(cells[9])) || cleanPlayerName($(cells[10])),
                table: $(cells[11]).text().trim()
            };
            matchFound = true;
            return false; // Found the match, stop this loop
        }
    });

    // --- Pass 2: Build player history with round context ---
    // Iterate over direct children of the main content area that contains both H3s and table containers
    // Adjust 'div.col-md-12' if the main container has a different selector.
    const mainContentContainer = $('div.col-md-12').first();

    mainContentContainer.children().each((i, elementNode) => {
        const $element = $(elementNode);

        if ($element.is('h3.h3')) { // Check if the element is an H3 with class 'h3'
            const sectionTitle = $element.text().trim();
            currentSectionAbbreviation = abbreviateSectionTitle(sectionTitle);
            // console.log(`HISTORY: Found round header: '${sectionTitle}', Abbreviation: '${currentSectionAbbreviation}'`);
        } else if ($element.is('div.table-responsive')) {
            // This div contains the table, so now iterate its rows for history
            $element.find('table > tbody > tr').each((j, rowElement) => {
                const $row = $(rowElement);
                const tds = $row.find('td');

                if (tds.length < 12) return; // Skip rows not matching match structure
                const rowMatchId = $(tds[0]).text().trim();

                // Player history (using global PLAYER_ID), excluding the current live match
                if (PLAYER_ID && rowMatchId !== MATCH_ID) {
                    const p1Cell = $(tds[4]);
                    const p2CellForNameLogic1 = $(tds[9]);
                    const p2CellForNameLogic2 = $(tds[10]);

                    const p1Name = cleanPlayerName(p1Cell);
                    const p1Score = $(tds[6]).text().trim();
                    const p2Score = $(tds[8]).text().trim();
                    const p2Name = cleanPlayerName(p2CellForNameLogic1) || cleanPlayerName(p2CellForNameLogic2);

                    const p1LinkFound = p1Cell.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0;
                    const p2LinkFound = p2CellForNameLogic1.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0 ||
                                        p2CellForNameLogic2.find(`a[href*="/player/show/${PLAYER_ID}/"]`).length > 0;

                    let historyEntry = null;
                    if (p1Name && p2Name && p1Score !== '' && p2Score !== '') {
                        if (p1LinkFound && p2Name.toLowerCase() !== 'walkover') {
                            historyEntry = `${p1Name} ${p1Score} - ${p2Score} ${p2Name}`;
                        } else if (p2LinkFound && p1Name.toLowerCase() !== 'walkover') {
                            historyEntry = `${p2Name} ${p2Score} - ${p1Score} ${p1Name}`;
                        }
                    }

                    if (historyEntry) {
                        playerHistory.push(`${currentSectionAbbreviation}: ${historyEntry}`);
                    }
                }
            });
        }
    });

    if (matchFound) { // If current match was found, always return it
      const responsePayload = { ...currentMatchData };
      responsePayload.playerHistory = playerHistory;
      res.json(responsePayload);
    } else {
      // If current match was NOT found, but we might have history (e.g. if MATCH_ID was for a completed match)
      // Or if MATCH_ID was not set/relevant and we only wanted history.
      // For now, if MATCH_ID was specified and not found, it's an error.
      res.status(404).json({ error: `Match with ID ${MATCH_ID} not found` });
    }
  } catch (err) {
    console.error('Error in /score endpoint:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch or parse data', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
