const express = require('express');
const multer  = require('multer');
const xml2js  = require('xml2js');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3000;

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

app.use(express.static('public'));

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

// Analizza un testo CSV e lo converte in un array di oggetti, usando la prima riga come intestazione delle colonne
function parseCSV(testo) {
  const righe = testo.trim().split('\n');
  const intestazione = righe.shift().split(',').map(c => c.trim());
  return righe
    .filter(r => r.trim() !== '')
    .map(riga => {
      const valori = riga.split(',').map(v => v.trim());
      const oggetto = {};
      intestazione.forEach((col, i) => { oggetto[col] = valori[i] ?? ''; });
      return oggetto;
    });
}

// Analizza un testo XML e lo converte in un array di record estraendo la struttura gerarchica
function parseXML(testo) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(testo, { explicitArray: false }, (err, result) => {
      if (err) return reject(err);
      const radice = result;
      const chiaveRadice = Object.keys(radice)[0];
      const sotto = radice[chiaveRadice];
      const chiaveSotto = Object.keys(sotto)[0];
      let records = sotto[chiaveSotto];
      if (!Array.isArray(records)) records = [records];
      resolve(records);
    });
  });
}

// Converte un array di dati in formato JSON con formattazione leggibile
function convertiInJSON(dati) {
  return JSON.stringify(dati, null, 2);
}

// Converte un array di oggetti in formato CSV con intestazioni prese dalle chiavi del primo oggetto
function convertiInCSV(dati) {
  if (dati.length === 0) return '';
  const intestazione = Object.keys(dati[0]);
  const header = intestazione.join(',');
  const righe  = dati.map(obj => intestazione.map(k => obj[k] ?? '').join(','));
  return [header, ...righe].join('\n');
}

// Converte un array di dati in formato XML con nomi personalizzabili per l'elemento radice e i record
function convertiInXML(dati, nomeRadice = 'dati', nomeRecord = 'record') {
  const builder = new xml2js.Builder({ rootName: nomeRadice });
  const obj = { [nomeRecord]: dati };
  return builder.buildObject(obj);
}

// Recupera la lista di tutti i file salvati nella cartella output con dettagli di dimensione e data
app.get('/files', (req, res) => {
  // Prova a leggere i file dalla cartella output e gestisci eventuali errori di file system
  try {
    const files = fs.readdirSync(OUTPUT_DIR).map(nome => {
      const filePath = path.join(OUTPUT_DIR, nome);
      const stats = fs.statSync(filePath);
      return { nome, dimensione: stats.size, data: stats.mtime.toISOString() };
    });
    files.sort((a, b) => new Date(b.data) - new Date(a.data));
    res.json(files);
  } catch (err) {
    res.status(500).json({ errore: 'Impossibile leggere la lista dei file.' });
  }
});

// Scarica un file specifico dalla cartella output dal server al client
app.get('/files/:nome', (req, res) => {
  const nomeFile = path.basename(req.params.nome);
  const filePath = path.join(OUTPUT_DIR, nomeFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ errore: 'File non trovato.' });
  }
  res.download(filePath);
});

// Elimina un file specifico dalla cartella output
app.delete('/files/:nome', (req, res) => {
  const nomeFile = path.basename(req.params.nome);
  const filePath = path.join(OUTPUT_DIR, nomeFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ errore: 'File non trovato.' });
  }
  // Prova a eliminare il file e gestisci errori di file system
  try {
    fs.unlinkSync(filePath);
    res.json({ messaggio: 'File eliminato con successo.' });
  } catch (err) {
    res.status(500).json({ errore: 'Impossibile eliminare il file.' });
  }
});

// Elabora il caricamento di un file, lo converte nel formato richiesto e lo salva su disco, poi lo invia al client
app.post('/converti', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ errore: 'Nessun file caricato.' });
  }

  const formatoDestinazione = req.body.formatoDestinazione;
  const formatiValidi = ['json', 'xml', 'csv'];

  if (!formatiValidi.includes(formatoDestinazione)) {
    return res.status(400).json({ errore: 'Formato di destinazione non valido.' });
  }

  const testo      = req.file.buffer.toString('utf-8');
  const estOrigine = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  let dati         = [];

  // Prova a parsare il file nel formato sorgente (JSON, CSV o XML) e gestisci errori di parsing
  try {
    if (estOrigine === 'json') {
      dati = JSON.parse(testo);
      if (!Array.isArray(dati)) dati = [dati];
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

  let risultato   = '';
  let contentType = 'text/plain';

  // Prova a convertire i dati nel formato di destinazione e gestisci errori di conversione
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

  // Salva su disco
  const nomeOrig  = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const timestamp = Date.now();
  const nomeFile  = `${nomeOrig}_convertito_${timestamp}.${formatoDestinazione}`;
  const filePath  = path.join(OUTPUT_DIR, nomeFile);

  // Prova a salvare il file convertito su disco e gestisci errori di file system
  try {
    fs.writeFileSync(filePath, risultato, 'utf-8');
  } catch (err) {
    return res.status(500).json({ errore: 'Errore nel salvare il file: ' + err.message });
  }

  console.log(`Convertito ${estOrigine.toUpperCase()} → ${formatoDestinazione.toUpperCase()} → ${nomeFile}`);

  res.setHeader('Content-Disposition', `attachment; filename="${nomeFile}"`);
  res.setHeader('Content-Type', contentType);
  res.send(risultato);
});

// Gestisce gli errori 404 per tutte le route non trovate
app.use((req, res) => {
  res.status(404).send('<h1>404 - Pagina non trovata</h1>');
});

// Avvia il server in ascolto sulla porta specificata
app.listen(PORT, () => {
  console.log(`Server in esecuzione su http://localhost:${PORT}`);
});
