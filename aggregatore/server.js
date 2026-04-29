const express = require('express');
const multer  = require('multer');
const xml2js  = require('xml2js');
const path    = require('path');

const app  = express();
const PORT = 3000;

app.use(express.static('public'));

// ============================
//  MULTER – caricamento file
// ============================

// Salva il file in memoria (Buffer), non su disco
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const estensioni = ['.json', '.xml', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (estensioni.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Formato non supportato. Usa JSON, XML o CSV.'));
    }
  }
});

// ============================
//  FUNZIONI DI PARSING
// ============================

// Legge un CSV e restituisce un array di oggetti
function parseCSV(testo) {
  const righe = testo.trim().split('\n');
  const intestazione = righe.shift().split(',').map(c => c.trim());

  return righe
    .filter(r => r.trim() !== '')
    .map(riga => {
      const valori = riga.split(',').map(v => v.trim());
      const oggetto = {};
      intestazione.forEach((col, i) => {
        oggetto[col] = valori[i] ?? '';
      });
      return oggetto;
    });
}

// Legge un XML e restituisce un array di oggetti (Promise)
function parseXML(testo) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(testo, { explicitArray: false }, (err, result) => {
      if (err) return reject(err);

      // Prende il primo figlio della radice come array di record
      const radice = result;
      const chiaveRadice = Object.keys(radice)[0];
      const sotto = radice[chiaveRadice];
      const chiaveSotto = Object.keys(sotto)[0];
      let records = sotto[chiaveSotto];

      // xml2js restituisce un oggetto se c'è un solo elemento
      if (!Array.isArray(records)) records = [records];

      resolve(records);
    });
  });
}

// ============================
//  FUNZIONI DI CONVERSIONE
// ============================

// Array di oggetti → JSON
function convertiInJSON(dati) {
  return JSON.stringify(dati, null, 2);
}

// Array di oggetti → CSV
function convertiInCSV(dati) {
  if (dati.length === 0) return '';
  const intestazione = Object.keys(dati[0]);
  const header = intestazione.join(',');
  const righe  = dati.map(obj => intestazione.map(k => obj[k] ?? '').join(','));
  return [header, ...righe].join('\n');
}

// Array di oggetti → XML
function convertiInXML(dati, nomeRadice = 'dati', nomeRecord = 'record') {
  const builder = new xml2js.Builder({ rootName: nomeRadice });
  const obj = { [nomeRecord]: dati };
  return builder.buildObject(obj);
}

// ============================
//  ROUTE PRINCIPALE
// ============================

app.post('/converti', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ errore: 'Nessun file caricato.' });
  }

  const formatoDestinazione = req.body.formatoDestinazione;
  const formatiValidi = ['json', 'xml', 'csv'];

  if (!formatiValidi.includes(formatoDestinazione)) {
    return res.status(400).json({ errore: 'Formato di destinazione non valido.' });
  }

  const testo        = req.file.buffer.toString('utf-8');
  const estOrigine   = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  let dati           = [];

  // ── PARSING (da qualunque formato a array di oggetti) ──
  try {
    if (estOrigine === 'json') {
      dati = JSON.parse(testo);
      if (!Array.isArray(dati)) dati = [dati]; // gestisce anche oggetto singolo
    } else if (estOrigine === 'csv') {
      dati = parseCSV(testo);
    } else if (estOrigine === 'xml') {
      dati = await parseXML(testo);
    } else {
      return res.status(400).json({ errore: 'Formato sorgente non riconosciuto.' });
    }
  } catch (err) {
    return res.status(400).json({ errore: 'Errore nel leggere il file: ' + err.message });
  }

  // ── CONVERSIONE (da array di oggetti al formato scelto) ──
  let risultato    = '';
  let contentType  = 'text/plain';
  let nomeFile     = 'risultato.' + formatoDestinazione;

  try {
    if (formatoDestinazione === 'json') {
      risultato   = convertiInJSON(dati);
      contentType = 'application/json';
    } else if (formatoDestinazione === 'csv') {
      risultato   = convertiInCSV(dati);
      contentType = 'text/csv';
    } else if (formatoDestinazione === 'xml') {
      risultato   = convertiInXML(dati);
      contentType = 'application/xml';
    }
  } catch (err) {
    return res.status(500).json({ errore: 'Errore nella conversione: ' + err.message });
  }

  console.log(`Convertito ${estOrigine.toUpperCase()} → ${formatoDestinazione.toUpperCase()}`);

  // Manda il file convertito come download
  res.setHeader('Content-Disposition', `attachment; filename="${nomeFile}"`);
  res.setHeader('Content-Type', contentType);
  res.send(risultato);
});

// ============================
//  404
// ============================

app.use((req, res) => {
  res.status(404).send('<h1>404 - Pagina non trovata</h1>');
});

// ============================
//  AVVIO SERVER
// ============================

app.listen(PORT, () => {
  console.log(`Server in esecuzione su http://localhost:${PORT}`);
});
