// scripts/probe-sources.js
import https from 'https';
import * as cheerio from 'cheerio';
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function testFetch(url, name) {
  try {
    console.log(`\n========================================`);
    console.log(`Checking ${name} (${url})...`);
    console.log(`========================================`);

    const res = await fetch(url, {
      agent: url.startsWith('https:') ? httpsAgent : undefined,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 20000
    });

    console.log(`${name} HTTP Status:`, res.status);
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log(`${name} Title:`, $('title').text().trim());

    const found = [];
    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().replace(/\s+/g, ' ').trim();

      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        const lowerH = href.toLowerCase();
        const lowerT = text.toLowerCase();

        const isNotice = lowerH.includes('pdf') ||
                         lowerT.includes('recruitment') ||
                         lowerT.includes('advt') ||
                         lowerT.includes('vacancy') ||
                         lowerT.includes('project') ||
                         lowerT.includes('scientist') ||
                         lowerT.includes('technical') ||
                         lowerT.includes('engineer');

        if (isNotice) {
          let fullUrl = href;
          try {
            fullUrl = new URL(href, url).href;
          } catch {}
          found.push({ text: text.slice(0, 90), url: fullUrl });
        }
      }
    });

    console.log(`Found ${found.length} matching link(s):`);
    found.slice(0, 15).forEach((f, idx) => {
      console.log(`  [${idx + 1}] ${f.text || '(No text)'}`);
      console.log(`      -> ${f.url}`);
    });

    return { name, url, found };
  } catch (err) {
    console.error(`❌ ${name} Error:`, err.message);
    return { name, url, found: [], error: err.message };
  }
}

async function main() {
  await testFetch('https://www.nielit.gov.in/recruitments', 'NIELIT Recruitments');
  await testFetch('https://www.nielit.gov.in/content/vacancies', 'NIELIT Vacancies');
  await testFetch('https://bel-india.in/careers/', 'BEL Careers');
  await testFetch('https://cdac.in/careers', 'CDAC Careers Direct');
}

main();
