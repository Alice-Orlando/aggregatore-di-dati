/**
 * app.js - Entry point dell'applicazione
 * Aggregatore di dati: converte file tra formati JSON, CSV e XML
 */

const express = require('express');
const path    = require('path');

// Importiamo il router principale
const routes = require('./controllers/fileController');

const app  = express();
const PORT = 3000;

// ── Middleware ────────────────────────────────────────────────────────────────

// Parsing del body JSON (per eventuali richieste API future)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serviamo i file statici della cartella views (HTML, CSS, JS front-end)
app.use(express.static(path.join(__dirname, 'views')));

// ── Rotte ─────────────────────────────────────────────────────────────────────

// Tutte le rotte sono gestite dal controller
app.use('/', routes);

// ── Avvio server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Server avviato su http://localhost:${PORT}`);
  console.log('   Apri il browser e vai su http://localhost:3000\n');
});

module.exports = app;
