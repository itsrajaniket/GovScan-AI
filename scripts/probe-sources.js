import https from 'https';
import * as cheerio from 'cheerio';
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const agent = new https.Agent({ rejectUnauthorized: false });

async function inspect(url, label) {
  try {
    const res = await fetch(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 });
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log(`\n========================================`);
    console.log(`${label} (${url}) - Status: ${res.status}`);
    console.log(`Title: ${$('title').text().trim()}`);
    console.log(`========================================`);
    const links = [];
    $('a').each((i, elem) => {
      const h = $(elem).attr('href');
      const t = $(elem).text().replace(/\s+/g, ' ').trim();
      if (h && t.length > 5) {
        try {
          links.push({ text: t.slice(0, 80), url: new URL(h, url).href });
        } catch {}
      }
    });
    console.log(`Total text links: ${links.length}`);
    links.slice(0, 5).forEach((l, idx) => {
      console.log(`  [${idx + 1}] ${l.text} -> ${l.url}`);
    });
  } catch (e) {
    console.error(`❌ ${label} Error:`, e.message);
  }
}

async function main() {
  await inspect('https://careers.cdac.in/', 'CDAC Careers Direct');
  await inspect('https://www.nielit.gov.in/en/recruitments', 'NIELIT English');
  await inspect('https://www.nielit.gov.in/', 'NIELIT Home');
}

main();
