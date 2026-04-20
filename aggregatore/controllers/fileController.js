/**
 * controllers/fileController.js
 *
 * Gestisce tutte le rotte HTTP dell'applicazione:
 *
 *   POST /upload            → carica un file (JSON, CSV o XML)
 *   GET  /convert           → converte il file caricato in un altro formato
 *   GET  /download/:file    → scarica il file convertito
 *   GET  /preview           → anteprima JSON dei dati (ultimi 10 record)
 *   GET  /files             → lista dei file convertiti disponibili
 *
 * Il controller NON si occupa della logica di conversione:
 * quella è delegata al modello (dataModel.js).
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const dataModel = require('../models/dataModel');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAZIONE MULTER (gestione upload)
// ─────────────────────────────────────────────────────────────────────────────

// Definiamo dove salvare i file caricati e come rinominarli
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    // Manteniamo il nome originale ma aggiungiamo un timestamp
    // per evitare conflitti tra file con lo stesso nome
    const timestamp = Date.now();
    const ext       = path.extname(file.originalname);
    const base      = path.basename(file.originalname, ext);
    cb(null, `${base}_${timestamp}${ext}`);
  }
});

// Filtro: accettiamo solo JSON, CSV e XML
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/json',
    'text/csv',
    'text/xml',
    'application/xml',
    'text/plain',           // alcuni OS inviano i CSV come text/plain
    'application/octet-stream'
  ];

  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const allowedExts = ['json', 'csv', 'xml'];

  if (allowedExts.includes(ext)) {
    cb(null, true);   // accettiamo il file
  } else {
    cb(new Error(`Formato non supportato: .${ext}. Usa JSON, CSV o XML.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }  // limite: 10 MB
});

// ─────────────────────────────────────────────────────────────────────────────
// VARIABILE DI STATO (in memoria, semplice per un esame)
// Teniamo traccia dell'ultimo file caricato e dei dati parsati
// ─────────────────────────────────────────────────────────────────────────────

let lastUpload = {
  filename:  null,   // nome del file salvato in /uploads
  extension: null,   // 'json' | 'csv' | 'xml'
  data:      null,   // array di oggetti JS (risultato del parsing)
};

// ─────────────────────────────────────────────────────────────────────────────
// ROTTA 1 – POST /upload
// Carica il file, lo valida e ne esegue il parsing immediato
// ─────────────────────────────────────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  // Controllo che multer abbia ricevuto un file
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Nessun file ricevuto. Assicurati di selezionare un file.'
    });
  }

  try {
    const filePath  = req.file.path;
    const extension = path.extname(req.file.originalname).toLowerCase().replace('.', '');

    // Parsiamo subito il file e memorizziamo i dati
    const data = await dataModel.parseFile(filePath, extension);

    // Salviamo lo stato dell'ultimo upload
    lastUpload = {
      filename:  req.file.filename,
      extension: extension,
      data:      data,
    };

    res.json({
      success:  true,
      message:  `File "${req.file.originalname}" caricato con successo!`,
      filename: req.file.filename,
      format:   extension.toUpperCase(),
      records:  data.length,          // quanti record contiene il file
      preview:  data.slice(0, 3),     // mostriamo i primi 3 record come anteprima
    });

  } catch (err) {
    // Rimuoviamo il file se il parsing fallisce (file malformato)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(422).json({
      success: false,
      error:   `Errore nel parsing del file: ${err.message}`
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTTA 2 – GET /convert?from=json&to=csv
// Converte il file caricato nel formato richiesto
// ─────────────────────────────────────────────────────────────────────────────

router.get('/convert', async (req, res) => {
  const { from, to } = req.query;

  // Validazione parametri query
  const formatsValidi = ['json', 'csv', 'xml'];
  if (!from || !to) {
    return res.status(400).json({
      success: false,
      error: 'Parametri mancanti. Usa: /convert?from=json&to=csv'
    });
  }
  if (!formatsValidi.includes(from.toLowerCase()) || !formatsValidi.includes(to.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `Formato non valido. Formati supportati: ${formatsValidi.join(', ')}`
    });
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    return res.status(400).json({
      success: false,
      error: 'I formati "from" e "to" non possono essere uguali.'
    });
  }

  // Controlliamo che ci sia un file caricato
  if (!lastUpload.data) {
    return res.status(400).json({
      success: false,
      error: 'Nessun file caricato. Prima esegui un upload tramite POST /upload.'
    });
  }

  // Controlliamo che il formato sorgente corrisponda al file caricato
  if (lastUpload.extension !== from.toLowerCase()) {
    return res.status(400).json({
      success: false,
      error: `Il file caricato è in formato .${lastUpload.extension}, non .${from}`
    });
  }

  try {
    // Nome base per il file di output: prendiamo il nome senza estensione + "_converted"
    const baseName    = path.basename(lastUpload.filename, `.${lastUpload.extension}`);
    const outputName  = `${baseName}_to_${to.toLowerCase()}`;

    // Eseguiamo la conversione tramite il modello
    const outputPath  = await dataModel.convertData(lastUpload.data, to.toLowerCase(), outputName);
    const outputFile  = path.basename(outputPath);

    res.json({
      success:      true,
      message:      `Conversione ${from.toUpperCase()} → ${to.toUpperCase()} completata!`,
      outputFile:   outputFile,
      downloadUrl:  `/download/${outputFile}`,
      records:      lastUpload.data.length,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error:   `Errore durante la conversione: ${err.message}`
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTTA 3 – GET /download/:filename
// Permette di scaricare un file dalla cartella /converted
// ─────────────────────────────────────────────────────────────────────────────

router.get('/download/:filename', (req, res) => {
  const { filename } = req.params;

  // Sicurezza: rimuoviamo eventuali path traversal (es. "../../etc/passwd")
  const safeFilename = path.basename(filename);
  const filePath     = dataModel.getConvertedFilePath(safeFilename);

  // Controlliamo che il file esista
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error:   `File non trovato: ${safeFilename}`
    });
  }

  // res.download() invia il file come allegato (forza il download nel browser)
  res.download(filePath, safeFilename, (err) => {
    if (err) {
      console.error('Errore durante il download:', err);
      // Evitiamo di inviare una risposta doppia se l'header è già stato inviato
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Errore nel download del file.' });
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTTA 4 – GET /preview
// Mostra un'anteprima dei dati dell'ultimo file caricato (max 10 record)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/preview', (req, res) => {
  if (!lastUpload.data) {
    return res.status(400).json({
      success: false,
      error:   'Nessun file caricato. Prima esegui un upload.'
    });
  }

  const limit   = parseInt(req.query.limit) || 10;  // parametro opzionale: ?limit=5
  const preview = lastUpload.data.slice(0, limit);

  res.json({
    success:   true,
    filename:  lastUpload.filename,
    format:    lastUpload.extension.toUpperCase(),
    total:     lastUpload.data.length,
    showing:   preview.length,
    data:      preview,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTTA 5 – GET /files
// Elenca tutti i file presenti nella cartella /converted
// ─────────────────────────────────────────────────────────────────────────────

router.get('/files', (req, res) => {
  try {
    const files = dataModel.listConvertedFiles();

    // Aggiungiamo info utili per ogni file
    const filesInfo = files.map(f => {
      const filePath = dataModel.getConvertedFilePath(f);
      const stats    = fs.statSync(filePath);
      return {
        name:        f,
        size:        `${(stats.size / 1024).toFixed(2)} KB`,
        created:     stats.birthtime,
        downloadUrl: `/download/${f}`,
      };
    });

    res.json({
      success: true,
      count:   filesInfo.length,
      files:   filesInfo,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error:   `Errore nel listare i file: ${err.message}`
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTTA 6 – GET /status
// Restituisce lo stato corrente dell'app (utile per debug)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({
    success:     true,
    appName:     'Aggregatore Dati',
    version:     '1.0.0',
    fileCaricato: lastUpload.filename
      ? {
          nome:     lastUpload.filename,
          formato:  lastUpload.extension.toUpperCase(),
          record:   lastUpload.data.length,
        }
      : null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GESTIONE ERRORI MULTER
// Intercetta errori specifici di multer (es. file troppo grande)
// ─────────────────────────────────────────────────────────────────────────────

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error:   'File troppo grande. Dimensione massima: 10 MB.'
      });
    }
  }
  if (err) {
    return res.status(400).json({
      success: false,
      error:   err.message
    });
  }
  next();
});

module.exports = router;
