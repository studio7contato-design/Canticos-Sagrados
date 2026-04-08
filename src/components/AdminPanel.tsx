console.log("AdminPanel.tsx module loaded");
import React, { useState, useRef } from 'react';
import { X, Plus, Music, Image as ImageIcon, Tag, Hash, Upload, Loader2, Disc } from 'lucide-react';
import { Song, Album, MOCK_SONGS, supabase, getCoverUrl } from '../lib/supabase';
import { cn } from '../lib/utils';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSong: (song: Song) => void;
  onAddAlbum?: (album: Album) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, onAddSong, onAddAlbum }) => {
  const [activeMode, setActiveMode] = useState<'song' | 'album'>('song');
  const [isUploading, setIsUploading] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  // Song state
  const [newSong, setNewSong] = useState<Partial<Song>>({
    title: '',
    category: 'Versículos',
    theme: '',
    url: '',
    cover_url: '',
    is_free: true,
    duration: 180,
    status: 'lancamento',
    album_id: null
  });

  // Album state
  const [newAlbum, setNewAlbum] = useState<Partial<Album>>({
    title: '',
    cover_url: '',
    type: 'album',
    release_date: new Date().toISOString()
  });

  const switchMode = (mode: 'song' | 'album') => {
    setActiveMode(mode);
    setAudioFile(null);
    setImageFile(null);
  };

  const uploadFile = async (file: File, bucket: string) => {
    if (!supabase) throw new Error('Supabase não configurado');
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    // Para o bucket 'songs', usamos o caminho para gerar links assinados depois
    if (bucket === 'songs') return filePath;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newSong.title || (!audioFile && !newSong.url) || (!imageFile && !newSong.cover_url)) {
      alert('Por favor, preencha o título e selecione os arquivos ou insira os links.');
      return;
    }

    if (!supabase) {
      alert('Erro: Supabase não está conectado. Verifique suas chaves API.');
      return;
    }

    setIsUploading(true);

    try {
      if (activeMode === 'song') {
        let audioUrl = newSong.url;
        let imageUrl = newSong.cover_url;

        if (audioFile) {
          audioUrl = await uploadFile(audioFile, 'songs');
        }

        if (imageFile) {
          imageUrl = await uploadFile(imageFile, 'covers');
        }

        const songData = {
          title: newSong.title,
          category: newSong.category,
          theme: newSong.theme,
          url: audioUrl,
          cover_url: imageUrl,
          is_free: newSong.is_free,
          duration: newSong.duration,
          status: newSong.status,
          album_id: newSong.album_id || null
        };

        const { data, error } = await supabase
          .from('songs')
          .insert([songData])
          .select();

        if (error) throw error;

        if (data && data[0]) {
          const processedSong = {
            ...data[0],
            cover_url: getCoverUrl(data[0].cover_url)
          } as Song;
          onAddSong(processedSong);
          alert('Música adicionada com sucesso!');
          onClose();
        }
      } else {
        // Album mode
        let imageUrl = newAlbum.cover_url;

        if (imageFile) {
          imageUrl = await uploadFile(imageFile, 'covers');
        }

        const albumData = {
          title: newAlbum.title,
          cover_url: imageUrl,
          type: newAlbum.type,
          release_date: newAlbum.release_date
        };

        const { data, error } = await supabase
          .from('albums')
          .insert([albumData])
          .select();

        if (error) throw error;

        if (data && data[0]) {
          const processedAlbum = {
            ...data[0],
            cover_url: getCoverUrl(data[0].cover_url)
          } as Album;
          if (onAddAlbum) onAddAlbum(processedAlbum);
          alert('Álbum criado com sucesso!');
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar no banco: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white z-10">
          <h2 className="text-xl font-bold">Painel Administrativo</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-100">
          <button 
            onClick={() => switchMode('song')}
            className={cn(
              "flex-1 py-3 text-sm font-bold transition-colors",
              activeMode === 'song' ? "text-apple-red border-b-2 border-apple-red" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Adicionar Música
          </button>
          <button 
            onClick={() => switchMode('album')}
            className={cn(
              "flex-1 py-3 text-sm font-bold transition-colors",
              activeMode === 'album' ? "text-apple-red border-b-2 border-apple-red" : "text-gray-400 hover:text-gray-600"
            )}
          >
            Criar Álbum
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto no-scrollbar flex-1">
          {activeMode === 'song' ? (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  <Music size={12} /> Título da Música
                </label>
                <input 
                  type="text" 
                  value={newSong.title}
                  onChange={e => setNewSong({...newSong, title: e.target.value})}
                  placeholder="Ex: Salmo 91"
                  className="w-full px-4 py-2.5 bg-gray-50 rounded-xl outline-none focus:ring-2 ring-apple-red/20 border border-transparent focus:border-apple-red/30 transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                    <Tag size={12} /> Categoria
                  </label>
                  <select 
                    value={newSong.category}
                    onChange={e => setNewSong({...newSong, category: e.target.value as any})}
                    className="w-full px-4 py-2.5 bg-gray-50 rounded-xl outline-none focus:ring-2 ring-apple-red/20 border border-transparent focus:border-apple-red/30 transition-all"
                  >
                    <option value="Versículos">Versículos</option>
                    <option value="Citações">Citações</option>
                    <option value="Autorais">Autorais</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                    <Hash size={12} /> Tema
                  </label>
                  <select 
                    value={newSong.theme}
                    onChange={e => setNewSong({...newSong, theme: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 rounded-xl outline-none focus:ring-2 ring-apple-red/20 border border-transparent focus:border-apple-red/30 transition-all"
                    required
                  >
                    <option value="">Selecione um tema</option>
                    <option value="Sábado">Sábado</option>
                    <option value="Santificação">Santificação</option>
                    <option value="Amor">Amor</option>
                    <option value="Esperança">Esperança</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  <Plus size={12} /> Tipo de Versão
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="status" 
                      value="lancamento" 
                      checked={newSong.status === 'lancamento'}
                      onChange={e => setNewSong({...newSong, status: e.target.value as any})}
                      className="w-4 h-4 accent-apple-red"
                    />
                    <span className="text-sm">Lançamento (Master)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="status" 
                      value="demo" 
                      checked={newSong.status === 'demo'}
                      onChange={e => setNewSong({...newSong, status: e.target.value as any})}
                      className="w-4 h-4 accent-apple-red"
                    />
                    <span className="text-sm">Demo (Incompleta)</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  <Hash size={12} /> ID do Álbum (Opcional)
                </label>
                <input 
                  type="text" 
                  value={newSong.album_id || ''}
                  onChange={e => setNewSong({...newSong, album_id: e.target.value || null})}
                  placeholder="Cole o ID do álbum do Supabase"
                  className="w-full px-4 py-2.5 bg-gray-50 rounded-xl outline-none focus:ring-2 ring-apple-red/20 border border-transparent focus:border-apple-red/30 transition-all"
                />
                <p className="text-[10px] text-gray-400">Deixe em branco se for um Single.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  <Upload size={12} /> Arquivo de Áudio (MP3)
                </label>
                <div className="flex flex-col gap-2">
                  <input 
                    type="file" 
                    accept="audio/mp3,audio/mpeg"
                    onChange={e => setAudioFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-apple-red/10 file:text-apple-red hover:file:bg-apple-red/20"
                  />
                  <p className="text-[10px] text-gray-400">Ou cole um link direto abaixo:</p>
                  <input 
                    type="url" 
                    value={newSong.url}
                    onChange={e => setNewSong({...newSong, url: e.target.value})}
                    placeholder="https://exemplo.com/musica.mp3"
                    className="w-full px-4 py-2 bg-gray-50 rounded-xl text-sm outline-none border border-transparent focus:border-apple-red/30"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  <ImageIcon size={12} /> Capa da Música (Imagem)
                </label>
                <div className="flex flex-col gap-2">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => setImageFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-apple-red/10 file:text-apple-red hover:file:bg-apple-red/20"
                  />
                  <p className="text-[10px] text-gray-400">Ou cole um link da imagem abaixo:</p>
                  <input 
                    type="url" 
                    value={newSong.cover_url}
                    onChange={e => setNewSong({...newSong, cover_url: e.target.value})}
                    placeholder="https://exemplo.com/capa.jpg"
                    className="w-full px-4 py-2 bg-gray-50 rounded-xl text-sm outline-none border border-transparent focus:border-apple-red/30"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
                <input 
                  type="checkbox" 
                  id="isFree"
                  checked={newSong.is_free}
                  onChange={e => setNewSong({...newSong, is_free: e.target.checked})}
                  className="w-5 h-5 accent-apple-red"
                />
                <label htmlFor="isFree" className="text-sm font-medium cursor-pointer">
                  Disponível para usuários gratuitos
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  <Disc size={12} /> Título do Álbum
                </label>
                <input 
                  type="text" 
                  value={newAlbum.title}
                  onChange={e => setNewAlbum({...newAlbum, title: e.target.value})}
                  placeholder="Ex: O Caminho da Santidade"
                  className="w-full px-4 py-2.5 bg-gray-50 rounded-xl outline-none focus:ring-2 ring-apple-red/20 border border-transparent focus:border-apple-red/30 transition-all"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  <Tag size={12} /> Tipo
                </label>
                <select 
                  value={newAlbum.type}
                  onChange={e => setNewAlbum({...newAlbum, type: e.target.value as any})}
                  className="w-full px-4 py-2.5 bg-gray-50 rounded-xl outline-none focus:ring-2 ring-apple-red/20 border border-transparent focus:border-apple-red/30 transition-all"
                >
                  <option value="album">Álbum</option>
                  <option value="single">Single</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                  <ImageIcon size={12} /> Capa do Álbum
                </label>
                <div className="flex flex-col gap-2">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => setImageFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-apple-red/10 file:text-apple-red hover:file:bg-apple-red/20"
                  />
                  <p className="text-[10px] text-gray-400">Ou cole um link da imagem abaixo:</p>
                  <input 
                    type="url" 
                    value={newAlbum.cover_url}
                    onChange={e => setNewAlbum({...newAlbum, cover_url: e.target.value})}
                    placeholder="https://exemplo.com/capa-album.jpg"
                    className="w-full px-4 py-2 bg-gray-50 rounded-xl text-sm outline-none border border-transparent focus:border-apple-red/30"
                  />
                </div>
              </div>
            </>
          )}

          <button 
            type="submit"
            disabled={isUploading}
            className="w-full py-4 bg-apple-red text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-apple-red/20"
          >
            {isUploading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                {activeMode === 'song' ? 'Enviando Música...' : 'Criando Álbum...'}
              </>
            ) : (
              <>
                <Plus size={20} />
                {activeMode === 'song' ? 'Adicionar Música' : 'Criar Álbum'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
