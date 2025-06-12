const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

function cleanPlayerName(cell) {
  const parts = cell.text().trim().split('\n').map(s => s.trim()).filter(Boolean);
  return parts.find(p => p.includes(' ')) || parts[0] || '';
}

function getFullFlagUrl(src) {
  if (!src) return '';
  return src.startsWith('http') ? src : `https://www.epbf.com${src.replace('..', '')}`;
}

function formatRoundName(round) {
  if (round.startsWith('SE - ')) {
    round = round.replace('SE - ', '').trim();
  }
  const letters = round.match(/[A-Za-z]+/g) || [];
  const digits = round.match(/\d+/g) || [];
  return letters.map(w => w[0].toUpperCase()).join('') + (digits.join('') || '');
}

function extractLastName(name) {
  return name.split(' ').find(part => part === part.toUpperCase()) || name;
}

app.get('/score', async (req, res) => {
  const { tournamentId, playerId } = req.query;

  if (!tournamentId || !playerId) {
    return res.status(400).json({ error: 'Missing tournamentId or playerId parameter' });
  }

  const EPBF_URL = `https://www.epbf.com/tournaments/eurotour/id/${tournamentId}/draw-results/`;

  try {
    const html = (await axios.get(EPBF_URL)).data;
    const $ = cheerio.load(html);
    const all = [];
    let currentRound = '';

    $('tbody').each((i, tbody) => {
      const $tb = $(tbody);
      if ($tb.hasClass('round_headline')) {
        currentRound = $tb.find('h3.h3').text().trim();
      } else if ($tb.hasClass('round_table')) {
        $tb.find('tr').each((j, tr) => {
          const tds = $(tr).find('td');
          if (tds.length < 14) return;

          const p1Cell = $(tds[4]);
          const p2Cell = $(tds[10]);
          const flag1Cell = $(tds[5]);
          const flag2Cell = $(tds[9]);

          const hasP1 = p1Cell.find(`a[href*="player/show/${playerId}/"]`).length > 0;
          const hasP2 = p2Cell.find(`a[href*="player/show/${playerId}/"]`).length > 0;
          if (!hasP1 && !hasP2) return;

          const player1 = cleanPlayerName(p1Cell);
          const player2 = cleanPlayerName(p2Cell);
          const score1 = $(tds[6]).text().trim();
          const score2 = $(tds[8]).text().trim();
          const raceTo = $(tds[3]).text().trim();
          const table = $(tds[11]).text().trim();
          const flag1 = getFullFlagUrl(flag1Cell.find('img').attr('src'));
          const flag2 = getFullFlagUrl(flag2Cell.find('img').attr('src'));
          const time = $(tds[1]).find('span.d-none.d-sm-block').text().trim();
          const matchId = $(tds[0]).text().trim();
          const statusCell = $(tds[13]);
          const status = statusCell.find('span').attr('title')?.trim() || '';

          if (!player1 || !player2 || score1 === '' || score2 === '' ||
              player1.toLowerCase().includes('walkover') ||
              player2.toLowerCase().includes('walkover')) return;

          all.push({
            matchId, time, round: currentRound,
            player1, player2, score1, score2, raceTo, table,
            flag1, flag2, status
          });
        });
      }
    });

    if (!all.length) return res.status(404).json({ error: 'No matches found for player' });

    const history = all.slice(0, -1).map(match => {
      const roundShort = formatRoundName(match.round);
      const p1 = extractLastName(match.player1);
      const p2 = extractLastName(match.player2);
      return `${roundShort}: ${p1} ${match.score1} - ${match.score2} ${p2}`;
    });

    return res.json({
      allMatches: all,
      matchHistory: history
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch or parse' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
