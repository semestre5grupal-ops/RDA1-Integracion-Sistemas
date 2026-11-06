async function main() {
  const chunks = [
    'chunk-lLBDgEKu.js',
    'chunk-BLw9q7iS.js',
    'chunk-B2GxiI--.js',
    'chunk-DpzL2y6g.js',
    'chunk-tQRiSB3y.js',
    'chunk-CGRrZQjq.js',
    'chunk-DDo4Okxb.js',
    'chunk-DPTGtvrw.js',
    'main-UFWOSUB6.js'
  ];
  for (const c of chunks) {
    const res = await fetch('https://viveloecuador-hufhcvg6eah6e2fm.brazilsouth-01.azurewebsites.net/' + c);
    const text = await res.text();
    const idx = text.indexOf('cupos');
    if (idx !== -1) {
      console.log('Match cupos in', c, 'at', idx);
      console.log(text.slice(Math.max(0, idx - 100), Math.min(text.length, idx + 300)));
    }
  }
}
main();
