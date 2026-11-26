import fs from 'fs';
import path from 'path';

const files = [];
function scan(dir) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) scan(full);
    else if (full.endsWith('.dart')) files.push(full);
  }
}
scan('booking_flutter/lib');
console.log('Total Dart files found:', files.length);

let errors = 0;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');

  // Check balanced parens, brackets, braces
  let parens = 0, brackets = 0, braces = 0;
  let inString = false, strChar = '', inComment = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];
    if (!inString && !inComment && ch === '/' && next === '/') {
      i = content.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (!inString && !inComment && ch === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (inComment && ch === '*' && next === '/') {
      inComment = false;
      i++;
      continue;
    }
    if (inComment) continue;

    if (!inString && (ch === '\'' || ch === '"')) {
      inString = true;
      strChar = ch;
      continue;
    }
    if (inString && ch === '\\') {
      i++;
      continue;
    }
    if (inString && ch === strChar) {
      inString = false;
      continue;
    }
    if (inString) continue;

    if (ch === '(') parens++;
    else if (ch === ')') parens--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
    else if (ch === '{') braces++;
    else if (ch === '}') braces--;

    if (parens < 0 || brackets < 0 || braces < 0) {
      console.error('Balance error in:', f, { parens, brackets, braces, at: i });
      errors++;
      break;
    }
  }
  if (parens !== 0 || brackets !== 0 || braces !== 0) {
    console.error('Unclosed symbols in:', f, { parens, brackets, braces });
    errors++;
  }

  // Check forbidden imports
  if (content.includes('cart_provider.dart') || content.includes('CartProvider')) {
    console.error('Forbidden CartProvider found in:', f);
    errors++;
  }
  // Check OccupancySelection constructor with ninos:
  if (/OccupancySelection\s*\([^)]*ninos\s*:/g.test(content)) {
    console.error('Found forbidden ninos: param in OccupancySelection in:', f);
    errors++;
  }

  // Check DropdownButtonFormField initialValue
  if (/DropdownButtonFormField[^;]*initialValue\s*:/gs.test(content)) {
    console.warn('Warning: DropdownButtonFormField with initialValue in:', f);
  }
}

if (errors === 0) {
  console.log(`✅ ALL ${files.length} DART FILES ARE SYNTACTICALLY BALANCED AND FREE OF ERRORS!`);
} else {
  console.error('❌ Found ' + errors + ' errors.');
  process.exit(1);
}
