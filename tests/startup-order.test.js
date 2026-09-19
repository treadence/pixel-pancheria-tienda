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

assert(
  source.includes('Chrome Android + GPU Mali'),
  'Debe conservarse el fallback móvil para evitar fallos del compositor con la tarjeta Backdoor'
);
assert(
  source.includes('.hack-card::after {\n        display: none;\n        mix-blend-mode: normal;'),
  'El fallback móvil debe desactivar las capas mezcladas animadas'
);
assert(
  source.includes('animation: backdoorTakeoverMobile 4.8s steps(1, end) infinite;'),
  'La transición Backdoor debe conservarar su animación compatible en móviles'
);
assert(
  source.includes('@keyframes backdoorTakeoverMobile'),
  'Debe existir la animación móvil sin clip-path animado'
);

console.log('startup-order: animación gráfica móvil compatible presente');
