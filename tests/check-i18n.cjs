const fs = require('fs');
const path = require('path');
const en = require('../js/i18n/en.json');
const ar = require('../js/i18n/ar.json');

function scanDir(dir) {
  let res = [];
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      res = res.concat(scanDir(full));
    } else if (f.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const regex = /I18n\.t\(['"]([^'"]+)['"]\)/g;
      let m;
      while ((m = regex.exec(content)) !== null) {
        res.push({ file: f, key: m[1] });
      }
    }
  }
  return res;
}

const calls = scanDir(path.resolve(__dirname, '../js'));
const missingEn = calls.filter(c => !(c.key in en));
const missingAr = calls.filter(c => !(c.key in ar));

console.log('Total I18n.t calls found:', calls.length);
console.log('Missing in en.json:', missingEn);
console.log('Missing in ar.json:', missingAr);
