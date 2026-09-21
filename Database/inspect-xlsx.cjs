'use strict';
const XLSX = require('xlsx');
const path = require('node:path');
const wb = XLSX.readFile(path.join(__dirname, 'party_characters_data (1).xlsx'));
const rows = XLSX.utils.sheet_to_json(wb.Sheets.Data, { header: 1, defval: null }).slice(3);
const cats = new Set();
const cities = new Set();
for (const r of rows) {
  if (!r || !r[2]) continue;
  cats.add(r[0]);
  cities.add(r[1]);
}
console.log([...cats]);
console.log([...cities]);
console.log('n', rows.filter((r) => r && r[2]).length);
