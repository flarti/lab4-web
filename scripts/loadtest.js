// Простий навантажувальний тест: node scripts/loadtest.js <url> [запитів] [паралельність]
const url = process.argv[2] || 'http://localhost:3002/health';
const total = Number(process.argv[3] || 100);
const concurrency = Number(process.argv[4] || 10);

const times = [];
let failed = 0;
let sent = 0;

async function worker() {
  while (sent < total) {
    sent++;
    const start = performance.now();
    try {
      const res = await fetch(url);
      if (!res.ok) failed++;
    } catch { failed++; }
    times.push(performance.now() - start);
  }
}

const t0 = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const seconds = (performance.now() - t0) / 1000;

times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1);
console.log(`URL: ${url}`);
console.log(`Запитів: ${total}, паралельно: ${concurrency}, помилок: ${failed}`);
console.log(`Час тесту: ${seconds.toFixed(2)} с, пропускна здатність: ${(total / seconds).toFixed(1)} запитів/с`);
console.log(`Затримка, мс: середня ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}, ` +
  `p50 ${pct(0.5)}, p95 ${pct(0.95)}, макс ${times[times.length - 1].toFixed(1)}`);
