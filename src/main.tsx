console.log("Main.tsx script loaded");
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

console.log("Main.tsx script loaded. App component type:", typeof App);

window.onerror = function(message, source, lineno, colno, error) {
  const msg = typeof message === 'string' ? message : (message as any)?.message || "";
  const lowerMsg = msg.toLowerCase();
  
  // Ignore benign Vite/HMR WebSocket and connection errors
  if (lowerMsg.includes('websocket') || 
      lowerMsg.includes('hmr') || 
      lowerMsg.includes('socket') ||
      lowerMsg.includes('connection') ||
      lowerMsg.includes('closed without opened')) {
    console.warn("Ignored benign global error:", msg);
    return false;
  }

  console.error("Global error caught:", message, "at", source, lineno, colno, error);
  var root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="padding: 20px; color: red; font-family: sans-serif; text-align: center;">' +
      '<h2>Erro ao carregar o App</h2>' +
      '<p>' + message + '</p>' +
      '<p>Tente recarregar a página. Se o erro persistir, verifique o console (F12).</p>' +
      '</div>';
  }
  return false;
};

window.onunhandledrejection = function(event) {
  const reason = event.reason;
  const message = reason?.message || String(reason);
  const lowerMsg = message.toLowerCase();
  
  // Ignore benign Vite/HMR WebSocket and connection errors
  if (lowerMsg.includes('websocket') || 
      lowerMsg.includes('hmr') || 
      lowerMsg.includes('socket') ||
      lowerMsg.includes('connection') ||
      lowerMsg.includes('closed without opened')) {
    console.warn("Ignored benign WebSocket/HMR rejection:", message);
    return;
  }

  console.error("Unhandled promise rejection:", reason);
  var root = document.getElementById('root');
  if (root && !root.innerHTML.includes('Erro ao carregar o App')) {
    root.innerHTML = '<div style="padding: 20px; color: orange; font-family: sans-serif; text-align: center;">' +
      '<h2>Erro de Conexão ou Promessa</h2>' +
      '<p>' + (message || "Erro desconhecido em uma promessa.") + '</p>' +
      '<p>Tente recarregar a página.</p>' +
      '</div>';
  }
};

console.log("App starting...");

var rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Root element not found!");
} else {
  try {
    console.log("Attempting to create root and render...");
    var root = createRoot(rootElement);
    root.render(<App />);
    console.log("App render call completed");
  } catch (e) {
    console.error("Fatal error during render:", e);
    rootElement.innerHTML = '<div style="padding: 20px; color: red; font-family: sans-serif; text-align: center;">' +
      '<h2>Erro Fatal ao Renderizar</h2>' +
      '<p>' + (e instanceof Error ? e.message : String(e)) + '</p>' +
      '</div>';
  }
}
