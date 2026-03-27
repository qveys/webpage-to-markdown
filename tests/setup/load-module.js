const fs = require('fs');
const vm = require('vm');
const path = require('path');

function loadModule(relativePath) {
  const absPath = path.resolve(__dirname, '../../', relativePath);
  const code = fs.readFileSync(absPath, 'utf8');
  vm.runInThisContext(code, { filename: absPath });
}

module.exports = { loadModule };
