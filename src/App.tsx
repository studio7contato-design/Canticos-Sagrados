console.log("App.tsx module loaded");
import React, { useState, useEffect, Component, ReactNode, ErrorInfo } from 'react';
import { Home, Compass, Heart, Search, User, Play, Lock, LogOut, Plus, Download, WifiOff, ShieldCheck, Disc, Mic2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Song, Album, MOCK_SONGS, supabase, getCoverUrl } from './lib/supabase';
import { Player } from './components/Player';
import { SubscriptionModal } from './components/SubscriptionModal';
import { AdminPanel } from './components/AdminPanel';
import { cn } from './lib/utils';

type Tab = 'inicio' | 'novidades' | 'favoritos' | 'downloads' | 'lancamentos' | 'demos' | 'albuns';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white p-8">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <WifiOff size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Algo deu errado</h2>
            <p className="text-gray-500">Ocorreu um erro inesperado ao carregar o aplicativo.</p>
            <div className="p-4 bg-gray-50 rounded-xl text-left overflow-auto max-h-40">
              <code className="text-xs text-red-500">{this.state.error?.message}</code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-apple-red text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  console.log("App component rendering");
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  console.log("AppContent rendering start");
  
  // Verificação de diagnóstico para o Netlify
  const isSupabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!isSupabaseConfigured && process.env.NODE_ENV === 'production') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-3xl shadow-xl border border-orange-100">
          <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Configuração Incompleta</h2>
          <p className="text-gray-600 mb-6 text-sm">
            O App foi publicado no Netlify, mas as chaves do <strong>Supabase</strong> não foram configuradas nas variáveis de ambiente do painel do Netlify.
          </p>
          <div className="bg-gray-50 p-4 rounded-xl text-left mb-6">
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Variáveis Faltando:</p>
            <ul className="text-xs space-y-1 text-gray-500 list-disc list-inside">
              <li>VITE_SUPABASE_URL</li>
              <li>VITE_SUPABASE_ANON_KEY</li>
            </ul>
          </div>
          <p className="text-xs text-gray-400">
            Adicione estas chaves no painel do Netlify e faça um novo "Deploy".
          </p>
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<Tab>('inicio');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('celeste_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Erro ao carregar favoritos:", e);
      return [];
    }
  });
  const [downloadedSongs, setDownloadedSongs] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('celeste_downloads');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Erro ao carregar downloads:", e);
      return [];
    }
  });
  useEffect(() => {
    console.log("App component mounted successfully");
  }, []);

  const [songs, setSongs] = useState<Song[]>(MOCK_SONGS);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Verificando conexão...');
  const [showLoginInput, setShowLoginInput] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('none');
  const [queue, setQueue] = useState<Song[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const initApp = async () => {
      console.log("[APP] Iniciando initApp...");
      setLoadingStatus('Iniciando...');

      // Test API Reachability
      fetch('/api/health')
        .then(r => r.ok ? setApiStatus('ok') : setApiStatus('error'))
        .catch(() => setApiStatus('error'));
      
      // 1. Check for success parameter from Stripe (fast)
      const params = new URLSearchParams(window.location.search);
      if (params.get('success') === 'true') {
        setIsPro(true);
      }

      // Safety timeout: show a skip button after 3 seconds, force close after 10
      const skipTimeoutId = setTimeout(() => {
        console.warn("[APP] Mostrando botão de pular carregamento");
        setLoadingTimeout(true);
      }, 3000);

      const forceTimeoutId = setTimeout(() => {
        console.warn("[APP] Timeout de inicialização atingido - Forçando entrada");
        setLoading(false);
      }, 10000);

      if (!supabase) {
        console.error("[APP] Supabase não inicializado.");
        setSongs(MOCK_SONGS);
        setQueue(MOCK_SONGS);
        setCurrentSong(MOCK_SONGS[0]);
        setLoading(false);
        return;
      }

      try {
        // 2. Start all critical fetches in parallel
        setLoadingStatus('Conectando ao banco de dados...');
        console.log("[APP] Iniciando buscas paralelas...");
        
        // Test API Reachability (fire and forget)
        fetch('/api/health').then(r => r.json()).catch(() => {});
        fetch('/api/test-direct').then(r => r.json()).catch(() => {});

        const [sessionRes, songsRes, albumsRes] = await Promise.all([
          supabase.auth.getSession().catch(err => {
            console.warn("[AUTH] Erro ao recuperar sessão inicial:", err);
            // Se o token for inválido, limpamos o rastro local para evitar loops de erro
            if (err.message?.includes('refresh_token') || err.message?.includes('Refresh Token')) {
              Object.keys(localStorage).forEach(key => {
                if (key.includes('supabase') || key.includes('sb-')) localStorage.removeItem(key);
              });
            }
            return { data: { session: null }, error: err };
          }),
          supabase.from('songs').select('*').order('created_at', { ascending: false }).limit(100),
          supabase.from('albums').select('*').order('release_date', { ascending: false }).limit(50)
        ]).catch(err => {
          console.error("[APP] Erro na busca inicial:", err);
          setDbError("Erro de conexão com o banco de dados.");
          return [
            { data: { session: null }, error: err }, 
            { data: [] as any[], error: err }, 
            { data: [] as any[], error: err }
          ] as any;
        });

        if (songsRes.error) {
          console.error("[APP] Erro ao buscar músicas:", songsRes.error);
          setDbError(`Erro ao carregar músicas: ${songsRes.error.message}`);
        }

        // 3. Handle Auth
        setLoadingStatus('Verificando sua conta...');
        const session = sessionRes.data?.session;
        if (session?.user) {
          setUser(session.user);
          // Don't await subscription check to avoid blocking UI
          checkSubscription(session.user.id);
        }

        // 4. Handle Songs
        setLoadingStatus('Carregando músicas...');
        if (songsRes.data && songsRes.data.length > 0) {
          const processedSongs = songsRes.data.map(s => ({
            ...s,
            cover_url: getCoverUrl(s.cover_url)
          })) as Song[];
          setSongs(processedSongs);
          setQueue(processedSongs);
          setCurrentSong(processedSongs[0]);
        } else {
          console.warn("[APP] Nenhuma música no Supabase. Mantendo MOCK_SONGS.");
          setQueue(MOCK_SONGS);
          if (!currentSong) setCurrentSong(MOCK_SONGS[0]);
        }

        // 5. Handle Albums
        if (albumsRes.data) {
          const processedAlbums = albumsRes.data.map(a => ({
            ...a,
            cover_url: getCoverUrl(a.cover_url)
          })) as Album[];
          setAlbums(processedAlbums);
        }

      } catch (err) {
        console.error("[APP] Erro na inicialização:", err);
        setSongs(MOCK_SONGS);
      } finally {
        setLoadingStatus('Pronto!');
        clearTimeout(skipTimeoutId);
        clearTimeout(forceTimeoutId);
        setLoading(false);
      }
    };

    initApp();

    // 4. Auth Listener
    if (!supabase) {
      console.error("[AUTH] Supabase não disponível para o listener");
      setLoading(false);
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[AUTH] Evento: ${event}, Usuário: ${session?.user?.email || 'Nenhum'}`);
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkSubscription(session.user.id);
      } else {
        setIsPro(false);
      }
    });

    // 5. Online/Offline Listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 6. OAuth Message Listener (for popups)
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data?.type === 'SUPABASE_AUTH_SUCCESS') {
        console.log("[AUTH] Sucesso via Popup detectado");
        const { hash, search } = event.data;
        
        if (hash) {
          const params = new URLSearchParams(hash.substring(1));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          
          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token
            });
            if (error) {
              console.error("[AUTH] Erro ao definir sessão:", error.message);
              // Se falhar ao definir a sessão (token inválido), limpamos o lixo local
              Object.keys(localStorage).forEach(key => {
                if (key.includes('supabase') || key.includes('sb-')) localStorage.removeItem(key);
              });
              setLoginError("Erro ao sincronizar login. Por favor, tente novamente.");
            } else {
              console.log("[AUTH] Sessão definida com sucesso para:", data.user?.email);
            }
          }
        }
        
        // Força atualização da UI
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
        if (session?.user) {
          await checkSubscription(session.user.id);
          setShowLoginInput(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      if (authListener?.subscription) authListener.subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginCooldown, setLoginCooldown] = useState(0);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (loginCooldown > 0) {
      const timer = setTimeout(() => setLoginCooldown(loginCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [loginCooldown]);

  const categories = Array.from(new Set(songs.map(s => s.category || 'Outros')));
  const themes = Array.from(new Set(songs.map(s => s.theme || 'Geral'))).slice(0, 8);

  console.log("[DEBUG] songs.length:", songs.length);
  console.log("[DEBUG] categories:", categories);
  console.log("[DEBUG] loading:", loading);

  useEffect(() => {
    localStorage.setItem('celeste_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('celeste_downloads', JSON.stringify(downloadedSongs));
  }, [downloadedSongs]);

  const checkSubscription = async (userId: string) => {
    if (!supabase) {
      console.warn("checkSubscription: Supabase client is null");
      return;
    }
    try {
      console.log("checkSubscription: Iniciando busca para o usuário:", userId);
      
      // Busca o usuário atual do Auth para pegar o e-mail
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const userEmail = authUser?.email || null;

      // Primeiro, tenta buscar o perfil via cliente (pode falhar se RLS estiver ativo)
      let { data, error } = await supabase
        .from('profiles')
        .select('is_pro, email')
        .eq('id', userId)
        .single();
      
      // Se o erro for que o registro não existe (PGRST116) ou erro de permissão (42501)
      // Vamos usar o servidor para inicializar o perfil com segurança
      if ((error && (error.code === 'PGRST116' || error.code === '42501')) || !data) {
        console.log("checkSubscription: Perfil não encontrado ou erro de permissão. Tentando inicializar via servidor...");
        
        try {
          // Só tentamos a API se ela estiver respondendo
          if (apiStatus === 'ok') {
            const response = await fetch('/api/init-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, email: userEmail })
            });
            
            if (response.ok) {
              const result = await response.json();
              data = result.profile;
              error = null;
            }
          }
        } catch (fetchErr) {
          console.error("checkSubscription: Erro ao chamar init-profile:", fetchErr);
        }
      } else if (error) {
        console.error("checkSubscription: Erro ao buscar perfil:", error.message);
        return;
      }
      
      if (data) {
        console.log("checkSubscription: Status PRO carregado:", data.is_pro);
        setIsPro(data.is_pro);
        
        // Se o e-mail estiver faltando no banco ou for diferente, vamos atualizar via API (Admin)
        // Usamos a API porque o cliente pode ser bloqueado por RLS
        if (data.email !== userEmail && userEmail) {
          console.log("checkSubscription: Sincronizando e-mail no perfil via API...");
          fetch('/api/init-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, email: userEmail })
          }).catch(err => console.error("Erro ao sincronizar e-mail:", err));
        }
      }
    } catch (err) {
      console.error("checkSubscription: Erro fatal:", err);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setLoginError("Erro: O banco de dados (Supabase) não está configurado corretamente no servidor.");
      return;
    }
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      // No ambiente de iframe do AI Studio, o redirecionamento direto falha com 403.
      // Usamos skipBrowserRedirect: true para obter a URL e abrir em um popup.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth-callback`,
          skipBrowserRedirect: true
        }
      });
      
      if (error) throw error;
      
      if (data?.url) {
        console.log("[AUTH] Abrindo popup de login Google...");
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const authWindow = window.open(
          data.url, 
          'google_login', 
          `width=${width},height=${height},left=${left},top=${top}`
        );
        
        if (!authWindow) {
          setLoginError("O popup foi bloqueado pelo navegador. Por favor, permita popups para este site.");
        }
      }
    } catch (err: any) {
      console.error("Erro no login Google:", err.message);
      if (err.message.includes('provider is not enabled')) {
        setLoginError("O login com Google ainda não foi ativado. Por favor, use e-mail e senha ou entre em contato com o suporte.");
      } else {
        setLoginError("Erro no Google Login: " + err.message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    console.log("[APP] Iniciando logout definitivo...");
    
    // 1. Limpeza imediata do estado local
    setUser(null);
    setIsPro(false);
    setShowLoginInput(false);
    setLoginError(null);
    
    try {
      if (supabase) {
        // Tenta deslogar no servidor
        await supabase.auth.signOut();
      }
      
      // 2. Limpeza MANUAL de todo o rastro do Supabase no navegador
      // Isso impede que a sessão "volte" sozinha
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          localStorage.removeItem(key);
        }
      });
      
      console.log("[APP] Cache de sessão limpo");
    } catch (err: any) {
      console.error("Erro ao limpar sessão:", err.message);
    } finally {
      // 3. Recarregamento total da página para o estado inicial
      window.location.href = window.location.origin;
    }
  };

  const handlePlaySong = (song: Song | undefined, customQueue?: Song[]) => {
    if (!song) return;
    if (!song.is_free && !isPro) {
      setIsModalOpen(true);
      return;
    }
    if (customQueue) {
      setQueue(customQueue);
    }
    setCurrentSong(song);
    setIsPlaying(true);
  };

  const handleNext = () => {
    if (repeatMode === 'one' && currentSong) {
      // Just restart the current song
      const audio = document.querySelector('audio');
      if (audio) audio.currentTime = 0;
      setIsPlaying(true);
      return;
    }

    let nextIndex;
    const currentQueue = queue.length > 0 ? queue : songs;
    const currentIndex = currentQueue.findIndex(s => s.id === currentSong?.id);

    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * currentQueue.length);
      // Try to avoid playing the same song again if possible
      if (nextIndex === currentIndex && currentQueue.length > 1) {
        nextIndex = (nextIndex + 1) % currentQueue.length;
      }
    } else {
      nextIndex = (currentIndex + 1) % currentQueue.length;
      
      // If we reached the end and repeat is none, stop
      if (nextIndex === 0 && repeatMode === 'none') {
        setIsPlaying(false);
        return;
      }
    }

    handlePlaySong(currentQueue[nextIndex]);
  };

  const handlePrev = () => {
    const currentQueue = queue.length > 0 ? queue : songs;
    const currentIndex = currentQueue.findIndex(s => s.id === currentSong?.id);
    const prevIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
    handlePlaySong(currentQueue[prevIndex]);
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);
  const toggleRepeat = () => {
    const modes: ('none' | 'one' | 'all')[] = ['none', 'all', 'one'];
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    setRepeatMode(nextMode);
  };

  const handleDownloadToApp = async (song: Song) => {
    if (!isPro) {
      setIsModalOpen(true);
      return;
    }

    try {
      const cache = await caches.open('celeste-songs-v1');
      const response = await fetch(song.url);
      if (!response.ok) throw new Error('Falha ao baixar arquivo');
      
      await cache.put(song.url, response);
      
      setDownloadedSongs(prev => {
        if (prev.find(s => s.id === song.id)) return prev;
        return [...prev, song];
      });
      
      alert(`"${song.title}" baixada para ouvir offline!`);
    } catch (error) {
      console.error('Erro ao baixar para o app:', error);
      alert('Erro ao baixar música para o app.');
    }
  };

  const toggleFavorite = (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(songId) 
        ? prev.filter(id => id !== songId) 
        : [...prev, songId]
    );
  };

  const handleAddSong = (newSong: Song) => {
    setSongs(prev => [newSong, ...prev]);
  };

  const handleAddAlbum = (newAlbum: Album) => {
    setAlbums(prev => [newAlbum, ...prev]);
  };

  const isAdmin = user?.email === 'ministeriomusicaceleste@gmail.com';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="w-12 h-12 border-4 border-apple-red border-t-transparent rounded-full animate-spin"></div>
          <div>
            <p className="text-sm font-medium text-gray-900">Carregando Cânticos Sagrados...</p>
            <p className="text-xs text-gray-400 mt-1">{loadingStatus}</p>
          </div>
          
          {loadingTimeout && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 space-y-4"
            >
              <p className="text-[10px] text-gray-400 max-w-xs">
                O carregamento está demorando mais que o esperado. Isso pode ser devido a uma conexão lenta ou configuração pendente.
              </p>
              <button 
                onClick={() => setLoading(false)}
                className="px-6 py-2 bg-gray-100 text-gray-600 rounded-full text-xs font-bold hover:bg-gray-200 transition-colors"
              >
                Pular Carregamento
              </button>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 bg-white lg:pl-64">
      {!isOnline && (
        <div className="bg-amber-500 text-white px-6 py-2 flex items-center justify-center gap-2 text-sm font-bold sticky top-0 z-50">
          <WifiOff size={16} /> Você está offline. Algumas funções podem não funcionar.
        </div>
      )}
      {/* Header */}
      <header className="sticky top-0 z-40 apple-blur px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">{import.meta.env.VITE_APP_NAME || 'Cânticos Sagrados'}</h1>
        {user ? (
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-gray-400 uppercase">Olá,</p>
              <p className="text-sm font-medium">{user.email?.split('@')[0]}</p>
            </div>
            <button 
              onClick={() => user && checkSubscription(user.id)}
              className="flex items-center gap-2 px-3 py-2 bg-apple-gray rounded-full text-gray-600 hover:text-apple-red hover:bg-red-50 transition-all active:scale-95"
              title="Atualizar Assinatura"
            >
              <ShieldCheck size={18} className={isPro ? "text-green-500" : "text-gray-400"} />
              <span className="text-xs font-bold hidden sm:inline">{isPro ? "Premium" : "Atualizar"}</span>
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 bg-apple-gray rounded-full text-gray-600 hover:text-apple-red hover:bg-red-50 transition-all active:scale-95"
              title="Sair"
            >
              <LogOut size={18} />
              <span className="text-xs font-bold hidden sm:inline">Sair</span>
            </button>
            {isAdmin && (
              <button 
                onClick={() => setIsAdminOpen(true)}
                className="p-2 bg-apple-red text-white rounded-full hover:bg-red-600 transition-colors shadow-lg shadow-apple-red/20"
                title="Painel Admin"
              >
                <Plus size={18} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {showLoginInput ? (
              <div className="flex flex-col gap-4 bg-white p-6 rounded-3xl shadow-2xl border border-gray-100 w-full sm:w-80">
                <div className="text-center mb-2">
                  <h3 className="font-bold text-lg">Acesse sua conta</h3>
                  <p className="text-xs text-gray-400">Entre com Google para continuar</p>
                </div>

                <button 
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="flex items-center justify-center gap-3 w-full py-3 bg-apple-red text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-apple-red/20"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-4 h-4 brightness-0 invert" />
                  Google
                </button>

                {loginError && (
                  <p className="text-[10px] text-apple-red font-bold text-center animate-pulse">
                    {loginError}
                  </p>
                )}

                <button 
                  onClick={() => setShowLoginInput(false)}
                  className="text-[10px] text-gray-400 font-bold uppercase hover:text-gray-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowLoginInput(true)}
                className="flex items-center gap-2 px-4 py-1.5 bg-apple-gray rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                <User size={16} />
                Entrar
              </button>
            )}
          </div>
        )}
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-8">
        {dbError && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
            <AlertCircle size={20} />
            <p className="text-sm font-medium">{dbError}</p>
          </div>
        )}
        {!supabase && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-700">
            <AlertCircle size={20} />
            <p className="text-sm font-medium">
              Atenção: O banco de dados não está conectado. Verifique as chaves do Supabase nos Secrets.
            </p>
          </div>
        )}
        <AnimatePresence mode="wait">
          {activeTab === 'inicio' && (
            <motion.div 
              key="inicio"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              {selectedTheme ? (
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-bold">Tema: {selectedTheme}</h2>
                    <button 
                      onClick={() => setSelectedTheme(null)}
                      className="text-apple-red font-medium hover:underline"
                    >
                      Ver tudo
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {songs.filter(s => s.theme === selectedTheme).map(song => (
                      <div 
                        key={song.id} 
                        className="group cursor-pointer"
                        onClick={() => handlePlaySong(song, songs.filter(s => s.theme === selectedTheme))}
                      >
                        <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all duration-300">
                          <img src={song.cover_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-white/90 p-3 rounded-full text-black">
                              {(song.is_free || isPro) ? <Play size={20} fill="currentColor" /> : <Lock size={20} />}
                            </div>
                          </div>
                        </div>
                        <h4 className="font-medium text-sm truncate">{song.title}</h4>
                        <p className="text-xs text-gray-400 truncate">{song.category}</p>
                      </div>
                    ))}
                  </div>
                  {songs.filter(s => s.theme === selectedTheme).length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-3xl">
                      <p className="text-gray-500">Nenhuma música encontrada para este tema ainda.</p>
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <section>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-3xl font-bold">Início</h2>
                      <button 
                        onClick={() => window.location.reload()}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                        title="Recarregar dados"
                      >
                        <Disc size={20} className={loading ? "animate-spin" : ""} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="relative h-64 rounded-3xl overflow-hidden group cursor-pointer" onClick={() => songs.length > 0 && handlePlaySong(songs[0])}>
                        <img 
                          src={songs.length > 0 ? songs[0].cover_url : "https://picsum.photos/seed/hero1/800/600"} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                          referrerPolicy="no-referrer" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-8">
                          <p className="text-white/70 text-sm font-medium uppercase tracking-widest mb-1">Destaque</p>
                          <h3 className="text-white text-2xl font-bold">
                            {songs.length > 0 ? songs[0].title : "Músicas para o Sábado"}
                          </h3>
                        </div>
                      </div>
                      <div className="relative h-64 rounded-3xl overflow-hidden group cursor-pointer" onClick={() => setIsModalOpen(true)}>
                        <img 
                          src={albums.length > 0 ? albums[0].cover_url : "https://picsum.photos/seed/hero2/800/600"} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                          referrerPolicy="no-referrer" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-apple-red/60 to-transparent flex flex-col justify-end p-8">
                          <p className="text-white/70 text-sm font-medium uppercase tracking-widest mb-1">Destaque</p>
                          <h3 className="text-white text-2xl font-bold">
                            {albums.length > 0 ? albums[0].title : "Apoie nosso Ministério"}
                          </h3>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Categories */}
                  {songs.length > 0 ? categories.map(cat => {
                    const catSongs = songs.filter(s => s.category === cat);
                    if (catSongs.length === 0) return null;
                    
                    return (
                      <section key={cat}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-bold">{cat}</h3>
                          <button 
                            onClick={() => handlePlaySong(catSongs[0], catSongs)}
                            className="text-apple-red text-sm font-medium hover:underline"
                          >
                            Ouvir tudo
                          </button>
                        </div>
                        <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4">
                          {catSongs.map(song => (
                            <div 
                              key={song.id} 
                              className="flex-shrink-0 w-40 group cursor-pointer"
                              onClick={() => handlePlaySong(song, catSongs)}
                            >
                              <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all duration-300">
                                <img src={song.cover_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <div className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-white/90 p-3 rounded-full text-black">
                                    {(song.is_free || isPro) ? <Play size={20} fill="currentColor" /> : <Lock size={20} />}
                                  </div>
                                </div>
                                <button 
                                  onClick={(e) => toggleFavorite(e, song.id)}
                                  className={cn(
                                    "absolute top-2 left-2 p-1.5 rounded-lg backdrop-blur-md transition-all z-10",
                                    favorites.includes(song.id) 
                                      ? "bg-apple-red/20 text-apple-red opacity-100" 
                                      : "bg-black/20 text-white opacity-0 group-hover:opacity-100 hover:bg-black/40"
                                  )}
                                >
                                  <Heart size={14} fill={favorites.includes(song.id) ? "currentColor" : "none"} />
                                </button>
                                {!song.is_free && !isPro && (
                                  <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md text-white p-1.5 rounded-lg">
                                    <Lock size={12} />
                                  </div>
                                )}
                              </div>
                              <h4 className="font-medium text-sm truncate">{song.title}</h4>
                              <p className="text-xs text-gray-400 truncate">{song.theme}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  }) : (
                    <div className="py-20 text-center">
                      <Disc size={48} className="mx-auto text-gray-200 mb-4 animate-pulse" />
                      <p className="text-gray-400">Nenhuma música encontrada no catálogo.</p>
                      {!supabase && <p className="text-xs text-amber-600 mt-2">Usando modo offline (Mock Data)</p>}
                    </div>
                  )}

                  {/* Albums Section */}
                  {albums.length > 0 && (
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">Álbuns</h3>
                        <button 
                          onClick={() => setActiveTab('albuns')}
                          className="text-apple-red text-sm font-medium hover:underline"
                        >
                          Ver todos
                        </button>
                      </div>
                      <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4">
                        {albums.map(album => (
                          <div 
                            key={album.id} 
                            className="flex-shrink-0 w-40 group cursor-pointer"
                            onClick={() => {
                              setSelectedAlbum(album);
                              setActiveTab('albuns');
                            }}
                          >
                            <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all duration-300">
                              <img src={album.cover_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                            <h4 className="font-medium text-sm truncate">{album.title}</h4>
                            <p className="text-xs text-gray-400 truncate">
                              {album.type === 'album' ? 'Álbum' : 'Single'} • {new Date(album.release_date).getFullYear()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Themes */}
                  <section>
                    <h3 className="text-xl font-bold mb-4">Explorar Temas</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {themes.map(theme => (
                        <div 
                          key={theme} 
                          onClick={() => setSelectedTheme(theme)}
                          className="h-24 rounded-2xl bg-apple-gray flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-all hover:scale-[1.02] active:scale-95"
                        >
                          <span className="font-semibold">{theme}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'albuns' && (
            <motion.div 
              key="albuns"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {selectedAlbum ? (
                <div>
                  <button 
                    onClick={() => setSelectedAlbum(null)}
                    className="flex items-center gap-2 text-apple-red font-medium mb-6 hover:underline"
                  >
                    ← Voltar para Álbuns
                  </button>
                  
                  <div className="flex flex-col md:flex-row gap-8 mb-12">
                    <img 
                      src={selectedAlbum.cover_url} 
                      className="w-64 h-64 rounded-3xl object-cover shadow-2xl" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex flex-col justify-end">
                      <p className="text-apple-red font-bold uppercase tracking-widest text-sm mb-2">
                        {selectedAlbum.type === 'album' ? 'Álbum' : 'Single'}
                      </p>
                      <h2 className="text-5xl font-bold mb-4">{selectedAlbum.title}</h2>
                      <div className="flex items-center gap-4 text-gray-500">
                        <span>{songs.filter(s => s.album_id === selectedAlbum.id).length} músicas</span>
                        <span>•</span>
                        <span>{new Date(selectedAlbum.release_date).getFullYear()}</span>
                      </div>
                      <div className="flex gap-4 mt-8">
                        <button 
                          onClick={() => {
                            const albumSongs = songs.filter(s => s.album_id === selectedAlbum.id);
                            if (albumSongs.length > 0) handlePlaySong(albumSongs[0], albumSongs);
                          }}
                          className="flex items-center gap-2 bg-apple-red text-white px-8 py-3 rounded-full font-bold hover:opacity-90 transition-all transform active:scale-95"
                        >
                          <Play size={20} fill="currentColor" /> Ouvir
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {songs.filter(s => s.album_id === selectedAlbum.id).map((song, idx) => (
                      <div 
                        key={song.id}
                        className="flex items-center gap-4 p-3 rounded-2xl hover:bg-apple-gray transition-colors cursor-pointer group"
                        onClick={() => handlePlaySong(song, songs.filter(s => s.album_id === selectedAlbum.id))}
                      >
                        <span className="w-6 text-center text-gray-400 font-medium">{idx + 1}</span>
                        <div className="flex-1">
                          <h4 className="font-semibold">{song.title}</h4>
                          <p className="text-xs text-gray-500">{song.theme}</p>
                        </div>
                        <div className="text-xs text-gray-400 mr-4">
                          {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
                        </div>
                        {!song.is_free && !isPro && <Lock size={16} className="text-gray-300" />}
                        <button 
                          onClick={(e) => toggleFavorite(e, song.id)}
                          className={cn(
                            "opacity-0 group-hover:opacity-100 p-2 transition-all",
                            favorites.includes(song.id) ? "text-apple-red opacity-100" : "text-gray-400 hover:text-apple-red"
                          )}
                        >
                          <Heart size={20} fill={favorites.includes(song.id) ? "currentColor" : "none"} />
                        </button>
                      </div>
                    ))}
                    {songs.filter(s => s.album_id === selectedAlbum.id).length === 0 && (
                      <div className="text-center py-12 bg-gray-50 rounded-3xl">
                        <p className="text-gray-500">Nenhuma música vinculada a este álbum ainda.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-3xl font-bold mb-8">Álbuns</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                    {albums.map(album => (
                      <div 
                        key={album.id} 
                        className="group cursor-pointer"
                        onClick={() => setSelectedAlbum(album)}
                      >
                        <div className="relative aspect-square rounded-3xl overflow-hidden mb-4 shadow-lg group-hover:shadow-2xl transition-all duration-500 group-hover:-translate-y-1">
                          <img src={album.cover_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        </div>
                        <h4 className="font-bold text-base truncate mb-1">{album.title}</h4>
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">
                          {album.type === 'album' ? 'Álbum' : 'Single'} • {new Date(album.release_date).getFullYear()}
                        </p>
                      </div>
                    ))}
                  </div>
                  {albums.length === 0 && (
                    <div className="text-center py-20 bg-apple-gray rounded-[40px]">
                      <Disc size={48} className="mx-auto text-gray-300 mb-4" />
                      <h3 className="text-xl font-bold text-gray-400">Nenhum álbum cadastrado</h3>
                      <p className="text-gray-400 text-sm mt-2">Use o painel admin para criar álbuns no Supabase.</p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'novidades' && (
            <motion.div 
              key="novidades"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-3xl font-bold mb-8">Novidades</h2>
              <div className="space-y-4">
                {songs.map((song, idx) => (
                  <div 
                    key={song.id}
                    className="flex items-center gap-4 p-3 rounded-2xl hover:bg-apple-gray transition-colors cursor-pointer group"
                    onClick={() => handlePlaySong(song)}
                  >
                    <span className="w-6 text-center text-gray-400 font-medium">{idx + 1}</span>
                    <img src={song.cover_url} className="w-14 h-14 rounded-xl object-cover" referrerPolicy="no-referrer" />
                    <div className="flex-1">
                      <h4 className="font-semibold">{song.title}</h4>
                      <p className="text-xs text-gray-500">{song.category} • {song.theme}</p>
                    </div>
                    {!song.is_free && !isPro && <Lock size={16} className="text-gray-300" />}
                    <button 
                      onClick={(e) => toggleFavorite(e, song.id)}
                      className={cn(
                        "opacity-0 group-hover:opacity-100 p-2 transition-all",
                        favorites.includes(song.id) ? "text-apple-red opacity-100" : "text-gray-400 hover:text-apple-red"
                      )}
                    >
                      <Heart size={20} fill={favorites.includes(song.id) ? "currentColor" : "none"} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'lancamentos' && (
            <motion.div 
              key="lancamentos"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-3xl font-bold mb-8">Lançamentos</h2>
              <p className="text-gray-500 mb-8">Músicas oficiais disponíveis em todas as plataformas digitais.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {songs.filter(s => s.status === 'lancamento').map(song => (
                  <div 
                    key={song.id} 
                    className="group cursor-pointer"
                    onClick={() => handlePlaySong(song, songs.filter(s => s.status === 'lancamento'))}
                  >
                    <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all duration-300">
                      <img src={song.cover_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-white/90 p-3 rounded-full text-black">
                          {(song.is_free || isPro) ? <Play size={20} fill="currentColor" /> : <Lock size={20} />}
                        </div>
                      </div>
                    </div>
                    <h4 className="font-medium text-sm truncate">{song.title}</h4>
                    <p className="text-xs text-gray-400 truncate">{song.theme}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'demos' && (
            <motion.div 
              key="demos"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-3xl font-bold mb-8">Demos</h2>
              <p className="text-gray-500 mb-8">Bastidores: Músicas em processo de criação e arranjos incompletos.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {songs.filter(s => s.status === 'demo').map(song => (
                  <div 
                    key={song.id} 
                    className="group cursor-pointer"
                    onClick={() => handlePlaySong(song, songs.filter(s => s.status === 'demo'))}
                  >
                    <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all duration-300">
                      <img src={song.cover_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-white/90 p-3 rounded-full text-black">
                          {(song.is_free || isPro) ? <Play size={20} fill="currentColor" /> : <Lock size={20} />}
                        </div>
                      </div>
                    </div>
                    <h4 className="font-medium text-sm truncate">{song.title}</h4>
                    <p className="text-xs text-gray-400 truncate">{song.theme}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'favoritos' && (
            <motion.div 
              key="favoritos"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold">Favoritos</h2>
                {favorites.length > 0 && (
                  <button 
                    onClick={() => {
                      const favSongs = songs.filter(s => favorites.includes(s.id));
                      handlePlaySong(favSongs[0], favSongs);
                    }}
                    className="flex items-center gap-2 bg-apple-red text-white px-6 py-2.5 rounded-full font-bold hover:opacity-90 transition-opacity"
                  >
                    <Play size={20} fill="currentColor" /> Ouvir Tudo
                  </button>
                )}
              </div>
              {favorites.length > 0 ? (
                <div className="space-y-4">
                  {songs.filter(s => favorites.includes(s.id)).map((song, idx) => (
                    <div 
                      key={song.id}
                      className="flex items-center gap-4 p-3 rounded-2xl hover:bg-apple-gray transition-colors cursor-pointer group"
                      onClick={() => handlePlaySong(song, songs.filter(s => favorites.includes(s.id)))}
                    >
                      <span className="w-6 text-center text-gray-400 font-medium">{idx + 1}</span>
                      <img src={song.cover_url} className="w-14 h-14 rounded-xl object-cover" referrerPolicy="no-referrer" />
                      <div className="flex-1">
                        <h4 className="font-semibold">{song.title}</h4>
                        <p className="text-xs text-gray-500">{song.category} • {song.theme}</p>
                      </div>
                      {!song.is_free && !isPro && <Lock size={16} className="text-gray-300" />}
                      <button 
                        onClick={(e) => toggleFavorite(e, song.id)}
                        className="p-2 text-apple-red transition-all"
                      >
                        <Heart size={20} fill="currentColor" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="w-20 h-20 bg-apple-gray rounded-3xl flex items-center justify-center mx-auto mb-6 text-gray-400">
                    <Heart size={40} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Suas músicas favoritas aparecerão aqui</h2>
                  <p className="text-gray-500 max-w-xs mx-auto">Toque no coração em qualquer música para salvá-la em sua biblioteca.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'downloads' && (
            <motion.div 
              key="downloads"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold">Downloads</h2>
                {downloadedSongs.length > 0 && (
                  <button 
                    onClick={() => handlePlaySong(downloadedSongs[0], downloadedSongs)}
                    className="flex items-center gap-2 bg-apple-red text-white px-6 py-2.5 rounded-full font-bold hover:opacity-90 transition-opacity"
                  >
                    <Play size={20} fill="currentColor" /> Ouvir Offline
                  </button>
                )}
              </div>
              {downloadedSongs.length > 0 ? (
                <div className="space-y-4">
                  {downloadedSongs.map((song, idx) => (
                    <div 
                      key={song.id}
                      className="flex items-center gap-4 p-3 rounded-2xl hover:bg-apple-gray transition-colors cursor-pointer group"
                      onClick={() => handlePlaySong(song, downloadedSongs)}
                    >
                      <span className="w-6 text-center text-gray-400 font-medium">{idx + 1}</span>
                      <img src={song.cover_url} className="w-14 h-14 rounded-xl object-cover" referrerPolicy="no-referrer" />
                      <div className="flex-1">
                        <h4 className="font-semibold">{song.title}</h4>
                        <p className="text-xs text-gray-500">{song.category} • {song.theme}</p>
                      </div>
                      <div className="flex items-center gap-2 text-green-500">
                        <Download size={16} />
                        <span className="text-[10px] font-bold uppercase">Offline</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="w-20 h-20 bg-apple-gray rounded-3xl flex items-center justify-center mx-auto mb-6 text-gray-400">
                    <Download size={40} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Sua biblioteca offline está vazia</h2>
                  <p className="text-gray-500 max-w-xs mx-auto">Assine o plano Premium e baixe músicas para ouvir mesmo sem internet.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {/* Debug Info (Only for development/troubleshooting) */}
        {(dbError || !supabase || apiStatus === 'error') && (
          <div className="mt-20 p-6 bg-gray-50 rounded-3xl border border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Status do Sistema</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full", supabase ? "bg-green-500" : "bg-red-500")} />
                <span className="text-xs font-medium">Supabase Cliente: {supabase ? "Conectado" : "Desconectado"}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full", songs.length > 0 ? "bg-green-500" : "bg-amber-500")} />
                <span className="text-xs font-medium">Banco de Dados: {songs.length > 0 ? `${songs.length} músicas` : "Vazio / Mock"}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full", apiStatus === 'ok' ? "bg-green-500" : apiStatus === 'checking' ? "bg-gray-300" : "bg-red-500")} />
                <span className="text-xs font-medium">Servidor API: {apiStatus === 'ok' ? "Online" : apiStatus === 'checking' ? "Verificando..." : "Erro 404 / Offline"}</span>
              </div>
            </div>
            {(apiStatus === 'error' || !supabase) && (
              <p className="mt-4 text-[10px] text-gray-400 leading-relaxed">
                <b>Dica:</b> Se o Servidor API estiver em vermelho, verifique se o <b>netlify.toml</b> está correto. 
                Se o Supabase estiver em vermelho, verifique as chaves <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> no painel do Netlify.
              </p>
            )}
          </div>
        )}
      </main>

      {/* Floating Navigation (Mobile & Tablet) */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-lg apple-blur border border-gray-200/50 px-4 py-3 flex justify-around items-center z-40 lg:hidden rounded-[2.5rem] shadow-2xl shadow-black/10">
        <button 
          onClick={() => setActiveTab('inicio')}
          className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'inicio' ? "text-apple-red" : "text-gray-400")}
        >
          <Home size={20} />
          <span className="text-[9px] font-medium">Início</span>
        </button>
        <button 
          onClick={() => setActiveTab('novidades')}
          className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'novidades' ? "text-apple-red" : "text-gray-400")}
        >
          <Compass size={20} />
          <span className="text-[9px] font-medium">Novidades</span>
        </button>
        <button 
          onClick={() => setActiveTab('lancamentos')}
          className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'lancamentos' ? "text-apple-red" : "text-gray-400")}
        >
          <Disc size={20} />
          <span className="text-[9px] font-medium">Lançamentos</span>
        </button>
        <button 
          onClick={() => setActiveTab('demos')}
          className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'demos' ? "text-apple-red" : "text-gray-400")}
        >
          <Mic2 size={20} />
          <span className="text-[9px] font-medium">Demos</span>
        </button>
        <button 
          onClick={() => { setActiveTab('albuns'); setSelectedAlbum(null); }}
          className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'albuns' ? "text-apple-red" : "text-gray-400")}
        >
          <Disc size={20} />
          <span className="text-[9px] font-medium">Álbuns</span>
        </button>
        <button 
          onClick={() => setActiveTab('favoritos')}
          className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'favoritos' ? "text-apple-red" : "text-gray-400")}
        >
          <Heart size={20} />
          <span className="text-[9px] font-medium">Favoritos</span>
        </button>
        <button 
          onClick={() => setActiveTab('downloads')}
          className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'downloads' ? "text-apple-red" : "text-gray-400")}
        >
          <Download size={20} />
          <span className="text-[9px] font-medium">Offline</span>
        </button>
      </nav>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 border-r border-gray-200 flex-col p-6 gap-8 bg-white z-50">
        <h1 className="text-xl font-bold tracking-tight mb-4">{import.meta.env.VITE_APP_NAME || 'Cânticos Sagrados'}</h1>
        
        <div className="space-y-1">
          <button 
            onClick={() => setActiveTab('inicio')}
            className={cn("w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors font-medium", activeTab === 'inicio' ? "bg-apple-red text-white" : "hover:bg-apple-gray text-gray-600")}
          >
            <Home size={20} /> Início
          </button>
          <button 
            onClick={() => setActiveTab('novidades')}
            className={cn("w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors font-medium", activeTab === 'novidades' ? "bg-apple-red text-white" : "hover:bg-apple-gray text-gray-600")}
          >
            <Compass size={20} /> Novidades
          </button>
          <button 
            onClick={() => { setActiveTab('albuns'); setSelectedAlbum(null); }}
            className={cn("w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors font-medium", activeTab === 'albuns' ? "bg-apple-red text-white" : "hover:bg-apple-gray text-gray-600")}
          >
            <Disc size={20} /> Álbuns
          </button>
          <button 
            onClick={() => setActiveTab('lancamentos')}
            className={cn("w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors font-medium", activeTab === 'lancamentos' ? "bg-apple-red text-white" : "hover:bg-apple-gray text-gray-600")}
          >
            <Disc size={20} /> Lançamentos
          </button>
          <button 
            onClick={() => setActiveTab('demos')}
            className={cn("w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors font-medium", activeTab === 'demos' ? "bg-apple-red text-white" : "hover:bg-apple-gray text-gray-600")}
          >
            <Mic2 size={20} /> Demos
          </button>
          <button 
            onClick={() => setActiveTab('favoritos')}
            className={cn("w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors font-medium", activeTab === 'favoritos' ? "bg-apple-red text-white" : "hover:bg-apple-gray text-gray-600")}
          >
            <Heart size={20} /> Favoritos
          </button>
          <button 
            onClick={() => setActiveTab('downloads')}
            className={cn("w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors font-medium", activeTab === 'downloads' ? "bg-apple-red text-white" : "hover:bg-apple-gray text-gray-600")}
          >
            <Download size={20} /> Offline
          </button>
        </div>

        <div className="mt-auto p-4 bg-apple-gray rounded-2xl">
          <p className="text-xs font-bold text-gray-400 uppercase mb-2">Seu Plano</p>
          <p className="text-sm font-semibold mb-3">{isPro ? 'Plano Premium Ativo' : 'Plano Gratuito'}</p>
          {!isPro && (
            <button 
              onClick={() => {
                console.log("Abrindo modal de assinatura...");
                setIsModalOpen(true);
              }}
              className="w-full py-2 bg-apple-red text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
            >
              Assinar Agora
            </button>
          )}
        </div>
      </div>

      <Player 
        currentSong={currentSong}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onNext={handleNext}
        onPrev={handlePrev}
        isPro={isPro}
        onSubscribe={() => setIsModalOpen(true)}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        downloadedSongs={downloadedSongs}
        onDownloadToApp={handleDownloadToApp}
        isShuffle={isShuffle}
        onToggleShuffle={toggleShuffle}
        repeatMode={repeatMode}
        onToggleRepeat={toggleRepeat}
      />

      <SubscriptionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        userId={user?.id}
      />

      <AdminPanel 
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onAddSong={handleAddSong}
        onAddAlbum={handleAddAlbum}
      />
    </div>
  );
}
