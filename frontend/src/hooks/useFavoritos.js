import { useState, useEffect, useCallback } from 'react';

const KEY = 'conectachat_favoritos';

export function useFavoritos() {
  const [favoritos, setFavoritos] = useState(() => {
    try {
      const stored = localStorage.getItem(KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(favoritos));
    } catch (e) {
      console.error('Error guardando favoritos:', e);
    }
  }, [favoritos]);

  const toggleFavorito = useCallback((cancion) => {
    setFavoritos(prev => {
      const existe = prev.find(f => f.id === cancion.id);
      if (existe) return prev.filter(f => f.id !== cancion.id);
      return [...prev, {
        id: cancion.id,
        titulo: cancion.titulo,
        artista: cancion.artista,
        genero: cancion.genero,
        tono: cancion.tono,
        bpm: cancion.bpm,
      }];
    });
  }, []);

  const esFavorito = useCallback((id) => {
    return favoritos.some(f => f.id === id);
  }, [favoritos]);

  // Compatibilidad con sistema viejo (cc-favs Set de IDs)
  const favsSet = new Set(favoritos.map(f => f.id));

  return { favoritos, toggleFavorito, esFavorito, favsSet };
}
