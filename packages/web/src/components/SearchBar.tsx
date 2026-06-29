import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/** A search box, visible on every page, that jumps to /search on submit. */
export function SearchBar() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit} role="search">
      <input
        className="search"
        type="search"
        placeholder="Search an artist or song you've tallied…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </form>
  );
}
