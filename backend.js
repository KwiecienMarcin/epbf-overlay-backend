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

function filterUppercaseWords(text) {
  return text
    .split(' ')
    .filter(word => word === word.toUpperCase())
    .join(' ');
}

app.get('/score', async (req, res) => {
  try {
    const response = await axios.get(EPBF_URL);
    const $ = cheerio.load(response.data);

    let currentMatchData = {};
    let matchFound = false;
    const playerHistory = [];
    let currentSectionAbbreviation = '';

    $('table tr').each((i, el) => {
      const tds = $(el).find('td');

      const roundNameCell = $(el).children('td.roundname[colspan="12"]');
      if (roundNameCell.length > 0) {
        const sectionTitle = roundNameCell.text().trim();
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
          const p1Clean = filterUppercaseWords(p1Name);
          const p2Clean = filterUppercaseWords(p2Name);
          const score1 = parseInt(p1Score, 10);
          const score2 = parseInt(p2Score, 10);

          if (p1Link && p2Clean.toLowerCase() !== 'walkover') {
            if (score1 > score2) {
              historyEntry = `**${p1Clean} ${p1Score}** - ${p2Score} ${p2Clean}`;
            } else {
              historyEntry = `${p1Clean} ${p1Score} - **${p2Score} ${p2Clean}**`;
            }
          } else if (p2Link && p1Clean.toLowerCase() !== 'walkover') {
            if (score2 > score1) {
              historyEntry = `**${p2Clean} ${p2Score}** - ${p1Score} ${p1Clean}`;
            } else {
              historyEntry = `${p2Clean} ${p2Score} - **${p1Score} ${p1Clean}**`;
            }
          }
        }

        if (p1Name && p2Name && p1Score !== '' && p2Score !== '') {
          // Pomijaj walkovery
          if (
            p1Name.toLowerCase().includes('walkover') ||
            p2Name.toLowerCase().includes('walkover')
          ) return;

          const p1NameParts = p1Name.split(' ').filter(p => /^[A-ZĄĆĘŁŃÓŚŹŻ-]+$/.test(p));
          const p2NameParts = p2Name.split(' ').filter(p => /^[A-ZĄĆĘŁŃÓŚŹŻ-]+$/.test(p));
          const p1Surname = p1NameParts.join(' ');
          const p2Surname = p2NameParts.join(' ');

          const p1ScoreNum = parseInt(p1Score);
          const p2ScoreNum = parseInt(p2Score);

          let formatted = '';
          if (p1Link && p1ScoreNum > p2ScoreNum) {
            formatted = `<b>${p1Surname} ${p1Score}</b> - ${p2Score} ${p2Surname}`;
          } else if (p1Link) {
            formatted = `${p1Surname} ${p1Score} - <b>${p2Score} ${p2Surname}</b>`;
          } else if (p2Link && p2ScoreNum > p1ScoreNum) {
            formatted = `<b>${p2Surname} ${p2Score}</b> - ${p1Score} ${p1Surname}`;
          } else if (p2Link) {
            formatted = `${p2Surname} ${p2Score} - <b>${p1Score} ${p1Surname}</b>`;
          }

          if (formatted) {
            playerHistory.push(`${formatted}`);
          }
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
