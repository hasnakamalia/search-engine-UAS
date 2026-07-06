import { useEffect, useMemo, useState } from 'react';
import FoodCard from './components/FoodCard.jsx';

const CALORIE_FILTERS = [
  { label: 'Semua', min: null, max: null },
  { label: '< 100 kkal', min: 0, max: 100 },
  { label: '100-300 kkal', min: 100, max: 300 },
  { label: '> 300 kkal', min: 300, max: null },
];

export default function App() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(0);
  const [results, setResults] = useState([]);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const filter = CALORIE_FILTERS[activeFilter];

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: query, limit: '100' });
        if (filter.min !== null) params.set('minCalories', filter.min);
        if (filter.max !== null) params.set('maxCalories', filter.max);

        const res = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Gagal mengambil data dari server');
        const data = await res.json();
        setResults(data.hits || []);
        setEstimatedTotal(data.estimatedTotalHits ?? data.hits?.length ?? 0);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, activeFilter]);

  const subtitle = useMemo(() => {
    if (loading) return 'mencari...';
    if (error) return error;
    return `${estimatedTotal} bahan pangan ditemukan`;
  }, [loading, error, estimatedTotal]);

  return (
    <div className="app">
      <section className="hero">
        <div className="hero-inner">
          <h1>
            Cari kandungan gizi
            <br />
            bahan pangan apapun.
          </h1>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Ketik nama makanan, mis. tempe, ayam, alpukat..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <p className="search-meta">{subtitle}</p>
        </div>
        <div className="filters">
          {CALORIE_FILTERS.map((f, i) => (
            <button
              key={f.label}
              className={i === activeFilter ? 'active' : ''}
              onClick={() => setActiveFilter(i)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <main>
        {!loading && results.length === 0 && (
          <div className="empty">Tidak ada hasil. Coba kata kunci lain.</div>
        )}
        {results.length > 0 && (
          <>
            <div className="results-count">
              Menampilkan {results.length} hasil
            </div>
            <div className="grid">
              {results.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </main>

      <footer>
        Pencarian berdasarkan bahan pangan dan description dengan filtering
        berdasarkan kandungan kalori
      </footer>
    </div>
  );
}
