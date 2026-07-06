// Push nutrition_enriched.json (atau nutrition.csv kalau belum di-enrich) ke Meilisearch.
// Cara pakai: npm run index

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { MeiliSearch } from "meilisearch";

const DATA_DIR = path.resolve(import.meta.dirname, "../data");
const ENRICHED_JSON = path.join(DATA_DIR, "nutrition_enriched.json");
const RAW_CSV = path.join(DATA_DIR, "nutrition.csv");

const client = new MeiliSearch({
  host: process.env.MEILI_HOST || "http://127.0.0.1:7700",
  apiKey: process.env.MEILI_MASTER_KEY,
});

function loadData() {
  if (fs.existsSync(ENRICHED_JSON)) {
    console.log("Pakai data yang sudah di-enrich (nutrition_enriched.json)");
    return JSON.parse(fs.readFileSync(ENRICHED_JSON, "utf-8"));
  }
  console.log("nutrition_enriched.json belum ada, pakai data mentah (tanpa description).");
  console.log("Jalankan `npm run enrich` dulu kalau mau ada kolom description.");
  const raw = fs.readFileSync(RAW_CSV, "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true });
}

async function main() {
  const data = loadData().map((item) => ({
    ...item,
    id: Number(item.id),
    calories: Number(item.calories),
    proteins: Number(item.proteins),
    fat: Number(item.fat),
    carbohydrate: Number(item.carbohydrate),
  }));

  const index = client.index("nutrition");

  await index.updateSettings({
    searchableAttributes: ["name", "description"],
    filterableAttributes: ["calories", "proteins", "fat", "carbohydrate"],
    sortableAttributes: ["calories", "proteins", "fat", "carbohydrate"],
  });

  const task = await index.addDocuments(data, { primaryKey: "id" });
  console.log(`Mengirim ${data.length} dokumen ke Meilisearch. Task UID: ${task.taskUid}`);
  console.log("Cek statusnya dengan: curl http://127.0.0.1:7700/tasks/" + task.taskUid);
}

main();
