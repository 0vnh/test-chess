/* Stockfish Web Worker proxy
   Tries multiple sources to load a COI-free build (asm.js) and proxies UCI messages.
*/
/* eslint-disable no-restricted-globals */
let engine = null;

function tryImport(urls){
  let lastErr = null;
  for(const url of urls){
    try{
      importScripts(url);
      postMessage('worker:source ' + url);
      return true;
    }catch(e){
      lastErr = e;
      // continue to next URL
    }
  }
  if(lastErr) throw lastErr;
  return false;
}

function init() {
  try {
    // Prefer known asm.js builds that don't require COOP/COEP
    const candidates = [
      'https://cdn.jsdelivr.net/gh/niklasf/stockfish.js/stockfish.js',
      'https://stockfishchess.org/js/stockfish.js',
      'https://unpkg.com/stockfish@16/stockfish.js'
    ];
    tryImport(candidates);
    const factory = self.STOCKFISH || (typeof STOCKFISH !== 'undefined' ? STOCKFISH : null);
    if (!factory) throw new Error('STOCKFISH factory not found');
    engine = factory();
    engine.onmessage = function (e) {
      postMessage(e && e.data ? e.data : e);
    };
    postMessage('worker:ready');
  } catch (err) {
    postMessage('worker:error ' + (err && err.message ? err.message : String(err)));
  }
}

onmessage = function (e) {
  const msg = e && e.data;
  if (!engine) {
    if (msg === 'init') {
      init();
      return;
    }
    init();
  }
  // Forward any string message to engine
  if (engine && typeof msg === 'string') {
    engine.postMessage(msg);
  }
};
