// Serves the PDF reader's worker from our own origin (bulk intake reads PDFs in the browser).
const fs = require('fs'); const path = require('path');
fs.copyFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), path.join(__dirname, '..', 'public', 'pdf.worker.min.mjs'));
