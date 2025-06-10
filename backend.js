const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const EPBF_URL = 'https://www.epbf.com/tournaments/eurotour/id/1334/draw-results/';
const PLAYER_ID = '3231';

function cleanPlayerName(cell) {
  const parts = cell.text().trim().split('\n').map(s => s.trim()).filter(Boolean);
  return parts.find(p => p.includes(' ')) || parts[0] || '';
}

function getFullFlagUrl(src) {
  if (!src) return '';
  return src.startsWith('http') ? src : `https://www.epbf.com${src.replace('..', '')}`;
}

app.get('/score', async (req, res) => {
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
          if (tds.length < 12) return;

          const p1 = $(tds[4]);
          const p2 = $(tds[9]).length ? $(tds[9]) : $(tds[10]);
          const matchId = $(tds[0]).text().trim();
          const time = $(tds[1]).find('span.d-none.d-sm-block').text().trim();
          const raceTo = $(tds[3]).text().trim();
          const score1 = $(tds[6]).text().trim();
          const score2 = $(tds[8]).text().trim();
          const table = $(tds[11]).text().trim();
          const flag1 = getFullFlagUrl($(tds[5]).find('img').attr('src'));
          const flag2 = getFullFlagUrl(
            $(tds[10]).find('img').attr('src') ||
            $(tds[9]).find('img').attr('src')
          );

          const hasP1 = p1.find(`a[href*="player/show/${PLAYER_ID}/"]`).length > 0;
          const hasP2 = p2.find(`a[href*="player/show/${PLAYER_ID}/"]`).length > 0;
          if (!hasP1 && !hasP2) return;

          const name1 = cleanPlayerName(p1);
          const name2 = cleanPlayerName(p2);
          if (![name1, name2, score1, score2, raceTo, time, matchId, table].every(x => x !== undefined)) return;
          if (name1.toLowerCase().includes('walkover') || name2.toLowerCase().includes('walkover')) return;

          all.push({
            matchId, time, round: currentRound,
            player1: name1, player2: name2,
            score1, score2, raceTo, table, flag1, flag2
          });
        });
      }
    });

    if (!all.length) return res.status(404).json({ error: 'No matches found for player' });
    return res.json({ allMatches: all });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch or parse' });
  }
});

app.listen(PORT, () => console.log('Listening on', PORT));
