// Enrichment script: baca nutrition.csv, generate kolom `description` pakai LLM,
// lalu simpan ke data/nutrition_enriched.json.
//
// Default pakai GROQ (gratis, tinggal daftar di console.groq.com, gak perlu kartu kredit).
// Kalau mau pakai Anthropic (berbayar) tinggal set PROVIDER=anthropic di .env.
//
// Cara pakai:
//   1. isi GROQ_API_KEY di backend/.env (contoh di .env.example)
//   2. npm install
//   3. npm run enrich
//
// Script ini RESUMABLE: kalau berhenti di tengah jalan (network error, rate limit, dsb),
// tinggal jalanin lagi `npm run enrich`, dia lanjut dari batch terakhir yang belum selesai.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const DATA_DIR = path.resolve(import.meta.dirname, '../data');
const INPUT_CSV = path.join(DATA_DIR, 'nutrition.csv');
const OUTPUT_JSON = path.join(DATA_DIR, 'nutrition_enriched.json');

const BATCH_SIZE = 12; // jumlah item per request (dikecilin biar aman dari TPM limit free tier)
const PROVIDER = process.env.PROVIDER || 'groq'; // "groq" (gratis) atau "anthropic" (berbayar)

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    apiKey: process.env.GROQ_API_KEY,
    envVarName: 'GROQ_API_KEY',
    signupUrl: 'https://console.groq.com/keys',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY,
    envVarName: 'ANTHROPIC_API_KEY',
    signupUrl: 'https://console.anthropic.com/settings/keys',
  },
};

const provider = PROVIDERS[PROVIDER];
if (!provider) {
  console.error(
    `PROVIDER tidak dikenal: ${PROVIDER}. Pakai "groq" atau "anthropic".`,
  );
  process.exit(1);
}
if (!provider.apiKey) {
  console.error(
    `${provider.envVarName} belum diset di backend/.env. Daftar dulu (gratis) di ${provider.signupUrl}`,
  );
  process.exit(1);
}

console.log(`Pakai provider: ${PROVIDER} (model: ${provider.model})`);

async function callLLM(prompt) {
  if (PROVIDER === 'groq') {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    });
    if (res.status === 429) {
      const body = await res.text();
      const err = new Error(`RATE_LIMIT: ${body}`);
      err.rateLimited = true;
      err.body = body;
      throw err;
    }
    if (!res.ok)
      throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // anthropic
  const res = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (res.status === 429) {
    const body = await res.text();
    const err = new Error(`RATE_LIMIT: ${body}`);
    err.rateLimited = true;
    err.body = body;
    throw err;
  }
  if (!res.ok)
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function parseWaitSeconds(errorBody) {
  // coba ambil angka dari pesan semacam "Please try again in 4.535s"
  const match = /try again in ([\d.]+)s/i.exec(errorBody || '');
  if (match) return parseFloat(match[1]);
  return 15; // fallback kalau format pesannya beda
}

async function callLLMWithRetry(prompt, maxRetries = 6) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callLLM(prompt);
    } catch (err) {
      if (err.rateLimited && attempt < maxRetries) {
        const wait = parseWaitSeconds(err.body) + 1; // +1s buffer
        console.log(
          `\n  Kena rate limit, nunggu ${wait.toFixed(1)}s (percobaan ${attempt}/${maxRetries})...`,
        );
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw err;
    }
  }
}

function loadCsv() {
  const raw = fs.readFileSync(INPUT_CSV, 'utf-8');
  return parse(raw, { columns: true, skip_empty_lines: true });
}

function loadExistingOutput() {
  if (fs.existsSync(OUTPUT_JSON)) {
    return JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf-8'));
  }
  return [];
}

function saveOutput(items) {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(items, null, 2));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function describeBatch(items) {
  const listText = items
    .map(
      (it, idx) =>
        `${idx + 1}. ${it.name} (kalori: ${it.calories} kkal, protein: ${it.proteins}g, lemak: ${it.fat}g, karbohidrat: ${it.carbohydrate}g per 100g)`,
    )
    .join('\n');

  const prompt = `Kamu adalah asisten yang menulis deskripsi singkat untuk katalog makanan/bahan pangan Indonesia.

Untuk setiap item di bawah, tulis SATU deskripsi singkat (1 kalimat, 15-30 kata, Bahasa Indonesia) yang menjelaskan apa itu makanan/bahan tersebut secara umum (bukan cuma mengulang angka gizinya). Kalau nama item ambigu/kurang familiar, buat deskripsi yang masuk akal berdasarkan nama dan kandungan gizinya.

Daftar item:
${listText}

Balas HANYA dengan JSON array berisi string, urut sesuai nomor di atas, tanpa teks lain, tanpa markdown code fence. Contoh format:
["deskripsi item 1", "deskripsi item 2", ...]`;

  const rawText = await callLLMWithRetry(prompt);

  const text = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/, '');

  const descriptions = JSON.parse(text);
  if (!Array.isArray(descriptions) || descriptions.length !== items.length) {
    throw new Error(
      `Jumlah deskripsi (${descriptions?.length}) tidak cocok dengan jumlah item (${items.length})`,
    );
  }
  return descriptions;
}

async function main() {
  const rows = loadCsv();
  const existing = loadExistingOutput();
  const doneIds = new Set(existing.map((r) => r.id));
  const remaining = rows.filter((r) => !doneIds.has(r.id));

  console.log(
    `Total item: ${rows.length}, sudah selesai: ${existing.length}, sisa: ${remaining.length}`,
  );

  const batches = chunk(remaining, BATCH_SIZE);
  const result = [...existing];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(
      `Batch ${i + 1}/${batches.length} (${batch.length} item)... `,
    );
    try {
      const descriptions = await describeBatch(batch);
      batch.forEach((item, idx) => {
        result.push({ ...item, description: descriptions[idx] });
      });
      saveOutput(result);
      console.log('OK');
    } catch (err) {
      console.log('GAGAL:', err.message);
      console.log(
        'Progress sudah tersimpan sampai batch sebelumnya. Jalankan lagi `npm run enrich` untuk lanjut.',
      );
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(
    `Selesai. Total item ter-enrich: ${result.length}. Disimpan di ${OUTPUT_JSON}`,
  );
}

main();
