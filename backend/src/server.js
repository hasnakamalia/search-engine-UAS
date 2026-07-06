import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MeiliSearch } from 'meilisearch';

const app = express();
app.use(
  cors({
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    origin: '*',
  }),
);
app.use(express.json());

const client = new MeiliSearch({
  host: process.env.MEILI_HOST || 'http://127.0.0.1:7700',
  apiKey: process.env.MEILI_MASTER_KEY,
});
const index = client.index('nutrition');

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// GET /api/search?q=ayam&limit=20&offset=0&sort=calories:asc&minCalories=0&maxCalories=500
app.get('/api/search', async (req, res) => {
  try {
    const {
      q = '',
      limit = 200,
      offset = 0,
      sort,
      minCalories,
      maxCalories,
    } = req.query;

    const filters = [];
    if (minCalories) filters.push(`calories >= ${Number(minCalories)}`);
    if (maxCalories) filters.push(`calories <= ${Number(maxCalories)}`);

    const searchParams = {
      limit: Number(limit),
      offset: Number(offset),
    };
    if (filters.length) searchParams.filter = filters.join(' AND ');
    if (sort) searchParams.sort = [sort];

    const results = await index.search(q, searchParams);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/food/:id', async (req, res) => {
  try {
    const doc = await index.getDocument(Number(req.params.id));
    res.json(doc);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Backend jalan di http://localhost:${PORT}`),
);
