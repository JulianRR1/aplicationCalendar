// Cache Only: este script forma parte del App Shell
(function(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        console.log('[SW] Registrado', reg.scope);
      } catch (err) {
        console.warn('[SW] Error en registro:', err);
      }
    });
  }
})();