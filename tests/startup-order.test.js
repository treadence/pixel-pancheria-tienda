const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const functionMatch = source.match(/function updateStockInUI\(\) \{([\s\S]*?)\n    \}/);

assert(functionMatch, 'No se encontró updateStockInUI');
assert(
  functionMatch[1].includes('window.currentProduct'),
  'updateStockInUI debe consultar window.currentProduct para poder ejecutarse antes de inicializar el estado del modal'
);
assert(
  !/(^|[^.\w])currentProduct\b/.test(functionMatch[1]),
  'updateStockInUI no debe leer directamente currentProduct durante el arranque'
);

console.log('startup-order: updateStockInUI es seguro durante el render inicial');

[
  'glitch-takeover',
  'hack-card',
  'backdoorTakeover',
  'marioSignal',
  'rgbHack',
  'scanHack',
  'productHack',
  'hackWarning'
].forEach(marker => {
  assert(
    !source.includes(marker),
    `La tienda publicada no debe incluir el efecto Backdoor desactivado (${marker})`
  );
});

console.log('startup-order: efecto Backdoor ausente de la tienda publicada');
