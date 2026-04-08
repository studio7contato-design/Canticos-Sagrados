console.log("SubscriptionModal.tsx module loaded");
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Heart, ShieldCheck, Music, Download, Loader2, AlertCircle } from 'lucide-react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, userId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isOpen) {
    console.log("SubscriptionModal está aberto. userId:", userId);
  }

  const handleSubscribe = async () => {
    setError(null);
    if (!userId) {
      setError('Você precisa estar logado para assinar o plano Premium.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CHECKOUT] Erro ${response.status}:`, errorText);
        let errorMessage = 'Erro no servidor';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          errorMessage = `Erro ${response.status}: O servidor retornou uma página HTML em vez de JSON. Verifique se a rota /api/create-checkout-session existe no servidor.`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.url) {
        // Abre em uma nova aba para evitar restrições de iframe do Stripe
        window.open(data.url, '_blank');
        onClose(); // Fecha o modal após abrir o pagamento
      } else {
        console.error('Erro ao criar sessão de checkout:', data.error);
        setError(data.error || 'Erro ao iniciar pagamento. Tente novamente.');
      }
    } catch (err: any) {
      console.error('Erro na requisição de checkout:', err);
      setError(`Erro ao processar: ${err.message || 'Verifique se o servidor está ativo.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="relative p-8 text-center">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-black transition-colors"
          >
            <X size={20} />
          </button>

          <div className="w-16 h-16 bg-apple-red/10 text-apple-red rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Heart size={32} fill="currentColor" />
          </div>

          <h2 className="text-2xl font-bold mb-2">Apoie o Ministério</h2>
          <p className="text-gray-500 mb-8">
            Sua assinatura nos ajuda a continuar produzindo músicas que inspiram e elevam a alma.
          </p>

          <div className="space-y-4 mb-8 text-left">
            <div className="flex items-start gap-3">
              <div className="mt-1 text-apple-red"><Download size={18} /></div>
              <div>
                <p className="font-semibold text-sm">Downloads Offline</p>
                <p className="text-xs text-gray-400">Ouça em qualquer lugar, sem internet.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-apple-red"><Music size={18} /></div>
              <div>
                <p className="font-semibold text-sm">Acesso Ilimitado</p>
                <p className="text-xs text-gray-400">Todo o nosso catálogo de Versículos e Autorais.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-apple-red"><ShieldCheck size={18} /></div>
              <div>
                <p className="font-semibold text-sm">Apoio Direto</p>
                <p className="text-xs text-gray-400">Contribua para a manutenção e novos projetos.</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-xs flex items-center gap-3 text-left animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={16} className="shrink-0" />
              <div className="flex-1">
                <p>{error}</p>
                {!userId && (
                  <button 
                    onClick={() => {
                      onClose();
                      // Aqui poderíamos abrir o modal de login se houvesse um estado global ou prop
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="mt-2 font-bold underline hover:no-underline"
                  >
                    Clique aqui para fazer login
                  </button>
                )}
              </div>
            </div>
          )}

          <button 
            onClick={!userId ? () => { onClose(); window.scrollTo({ top: 0, behavior: 'smooth' }); } : handleSubscribe}
            disabled={isLoading}
            className="w-full py-4 bg-apple-red text-white font-bold rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-apple-red/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processando...
              </>
            ) : !userId ? (
              'Faça login para assinar'
            ) : (
              'Assinar por R$ 5,99 / mês'
            )}
          </button>
          
          <p className="mt-4 text-[10px] text-gray-400">
            Cancele a qualquer momento. Termos e condições se aplicam.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
