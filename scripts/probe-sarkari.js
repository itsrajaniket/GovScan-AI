import https from 'https';
import * as cheerio from 'cheerio';
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const agent = new https.Agent({ rejectUnauthorized: false });

async function inspect(url) {
  const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
  const html = await res.text();
  const $ = cheerio.load(html);

  $('table tr').each((i, row) => {
    const text = $(row).text().replace(/\s+/g, ' ').trim();
    if (text.includes('Notification') || text.includes('Official') || text.includes('Apply')) {
      const links = [];
      $(row).find('a').each((_, a) => {
        links.push({ text: $(a).text().trim(), href: $(a).attr('href') });
      });
      console.log('Row:', text.slice(0, 50), '| Links:', links);
    }
  });
}

inspect('https://www.sarkariresult.com/2026/pgcil-engineer-trainee-nov26/').catch(console.error);
