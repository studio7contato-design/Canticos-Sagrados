console.log("Supabase.ts module loaded");
import { createClient } from '@supabase/supabase-js';

export const supabase = (() => {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
      try {
        // Validação básica de URL
        new URL(supabaseUrl);
        const client = createClient(supabaseUrl, supabaseAnonKey);
        console.log("Supabase client created successfully");
        return client;
      } catch (urlErr) {
        console.error("URL do Supabase inválida no cliente:", supabaseUrl);
      }
    }
  } catch (e) {
    console.error("Erro ao inicializar Supabase:", e);
  }
  console.warn("Supabase não configurado ou chaves inválidas. Usando modo offline/mock.");
  return null;
})();

export async function getSongUrl(path: string) {
  if (!supabase) return null;
  
  try {
    // Gera um link assinado que expira em 1 hora (3600 segundos)
    const { data, error } = await supabase.storage
      .from('songs')
      .createSignedUrl(path, 3600);

    if (error) {
      console.error('Erro ao gerar link da música:', error);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error('Erro fatal ao gerar link da música:', err);
    return null;
  }
}

export type Album = {
  id: string;
  title: string;
  cover_url: string;
  release_date: string;
  type: 'album' | 'single';
};

export type Song = {
  id: string;
  title: string;
  category: 'Versículos' | 'Citações' | 'Autorais';
  theme: string; // Playlist: Santificação, Amor, Esperança, etc.
  url: string;
  cover_url: string;
  is_free: boolean;
  duration: number;
  status: 'lancamento' | 'demo';
  album_id?: string | null;
};

export function getCoverUrl(path: string | null | undefined) {
  if (!path) return 'https://picsum.photos/seed/music/400/400';
  if (path.startsWith('http')) return path;
  if (!supabase) return path;
  
  const { data } = supabase.storage
    .from('covers')
    .getPublicUrl(path);
    
  return data.publicUrl;
}

// Mock data for initial development if Supabase is not connected
export const MOCK_SONGS: Song[] = [
  {
    id: '1',
    title: 'Salmo 23',
    category: 'Versículos',
    theme: 'Santificação',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    cover_url: 'https://picsum.photos/seed/psalm23/400/400',
    is_free: true,
    duration: 180,
    status: 'lancamento'
  },
  {
    id: '2',
    title: 'O Caminho a Cristo',
    category: 'Citações',
    theme: 'Santificação',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    cover_url: 'https://picsum.photos/seed/path/400/400',
    is_free: false,
    duration: 240,
    status: 'lancamento'
  },
  {
    id: '3',
    title: 'Hino do Sábado',
    category: 'Autorais',
    theme: 'Sábado',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    cover_url: 'https://picsum.photos/seed/sabbath/400/400',
    is_free: false,
    duration: 210,
    status: 'lancamento'
  },
  {
    id: '4',
    title: 'João 3:16',
    category: 'Versículos',
    theme: 'Amor',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    cover_url: 'https://picsum.photos/seed/john316/400/400',
    is_free: true,
    duration: 150,
    status: 'demo'
  },
  {
    id: '5',
    title: 'Luz do Mundo',
    category: 'Autorais',
    theme: 'Santificação',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    cover_url: 'https://picsum.photos/seed/light/400/400',
    is_free: false,
    duration: 195,
    status: 'demo'
  }
];
