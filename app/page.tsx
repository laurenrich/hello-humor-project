'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';


export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const tableName = 'captions';

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase.from(tableName).select('*');
      if (error) {
        console.error('Error fetching data:', error);
      } else {
        setData(data || []);
      }
      setLoading(false);
  }
  fetchData();
  }, []);

  if (loading) return <p>Loading...</p>

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Supabase Table Data</h1>
      <p style={{ marginTop: 8 }}>
        Try the protected route: <Link href="/protected">/protected</Link>
      </p>
      <ul>
        {data.length === 0 && <li>No data found yet.</li>}
        {data.map((row, i) => (
          <li key={i}>{JSON.stringify(row)}</li>
        ))}
      </ul>
    </div>
  );
}
