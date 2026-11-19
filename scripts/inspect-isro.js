import * as cheerio from 'cheerio';
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function inspect(url) {
  console.log(`Inspecting ${url}...`);
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log('Title:', $('title').text().trim());
  $('a').each((i, elem) => {
    const href = $(elem).attr('href');
    const t = $(elem).text().replace(/\s+/g, ' ').trim();
    if (href && (href.toLowerCase().includes('pdf') || href.toLowerCase().includes('apply'))) {
      try {
        console.log('  ->', t, ':', new URL(href, url).href);
      } catch {}
    }
  });
}

async function main() {
  await inspect('https://www.isro.gov.in/SDSCRecruitment26.html');
  await inspect('https://www.isro.gov.in/URSCRecruitment13.html');
}

main();
