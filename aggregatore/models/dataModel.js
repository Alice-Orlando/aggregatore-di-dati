/**
 * models/dataModel.js
 *
 * Questo modello gestisce tutta la logica di:
 *  - lettura dei file caricati
 *  - parsing di JSON, CSV e XML
 *  - conversione tra formati
 *  - salvataggio dei file convertiti
 *
 * È il cuore dell'applicazione: il controller chiama queste funzioni,
 * ma non si occupa di come i dati vengono trasformati.
 */

const fs      = require('fs');
const path    = require('path');
const csv     = require('csv-parser');
const fastCsv = require('fast-csv');
const xml2js  = require('xml2js');

// Cartelle usate dall'app (relative alla root del progetto)
const UPLOAD_DIR    = path.join(__dirname, '..', 'uploads');
const CONVERTED_DIR = path.join(__dirname, '..', 'converted');

// Ci assicuriamo che le cartelle esistano all'avvio
if (!fs.existsSync(UPLOAD_DIR))    fs.mkdirSync(UPLOAD_DIR,    { recursive: true });
if (!fs.existsSync(CONVERTED_DIR)) fs.mkdirSync(CONVERTED_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 1 – PARSING
// Ogni funzione legge un file dal disco e restituisce un array di oggetti JS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * parseJSON – legge e analizza un file JSON.
 * Il file deve contenere un array di oggetti oppure un singolo oggetto.
 *
 * @param {string} filePath - percorso assoluto del file
 * @returns {Promise<Array>} array di oggetti
 */
function parseJSON(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const raw     = fs.readFileSync(filePath, 'utf-8');
      const parsed  = JSON.parse(raw);

      // Normalizziamo: se è un oggetto singolo lo mettiamo in un array
      const data = Array.isArray(parsed) ? parsed : [parsed];
      resolve(data);
    } catch (err) {
      reject(new Error(`Errore nel parsing JSON: ${err.message}`));
    }
  });
}

/**
 * parseCSV – legge e analizza un file CSV riga per riga.
 * Usa la libreria csv-parser che trasforma ogni riga in un oggetto JS.
 *
 * @param {string} filePath - percorso assoluto del file
 * @returns {Promise<Array>} array di oggetti (una riga = un oggetto)
 */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv())                         // csv-parser converte ogni riga in oggetto
      .on('data', (row) => results.push(row))
      .on('end',  ()    => resolve(results))
      .on('error', (err) => reject(new Error(`Errore nel parsing CSV: ${err.message}`)));
  });
}

/**
 * parseXML – legge e analizza un file XML usando xml2js.
 * xml2js converte la struttura XML in un oggetto JS annidato.
 *
 * @param {string} filePath - percorso assoluto del file
 * @returns {Promise<Array>} array di oggetti estratti dal nodo radice
 */
function parseXML(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');

      // explicitArray: false → i valori singoli non vengono messi in array
      xml2js.parseString(raw, { explicitArray: false }, (err, result) => {
        if (err) {
          return reject(new Error(`Errore nel parsing XML: ${err.message}`));
        }

        // L'oggetto result ha una chiave radice (es. "root" o "data")
        // Prendiamo il contenuto del primo nodo figlio
        const rootKey  = Object.keys(result)[0];         // es. "root"
        const rootNode = result[rootKey];

        // Cerchiamo il primo array di elementi figli
        const childKey = Object.keys(rootNode)[0];       // es. "item"
        const items    = rootNode[childKey];

        // Normalizziamo in array
        const data = Array.isArray(items) ? items : [items];
        resolve(data);
      });
    } catch (err) {
      reject(new Error(`Impossibile leggere il file XML: ${err.message}`));
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 2 – CONVERSIONE
// Ogni funzione prende i dati già parsati (array di oggetti) e produce
// un file nel formato di destinazione, salvandolo in /converted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * convertToCSV – trasforma un array di oggetti in file CSV.
 * Usa fast-csv per scrivere header + righe.
 *
 * @param {Array}  data     - dati da convertire
 * @param {string} filename - nome del file di output (senza estensione)
 * @returns {Promise<string>} percorso del file salvato
 */
function convertToCSV(data, filename) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(CONVERTED_DIR, `${filename}.csv`);
    const ws         = fs.createWriteStream(outputPath);

    fastCsv
      .write(data, { headers: true })   // headers: true → scrive la riga di intestazione
      .pipe(ws)
      .on('finish', () => resolve(outputPath))
      .on('error',  (err) => reject(new Error(`Errore nella scrittura CSV: ${err.message}`)));
  });
}

/**
 * convertToJSON – trasforma un array di oggetti in file JSON formattato.
 * Usa fs.writeFileSync con indentazione di 2 spazi per leggibilità.
 *
 * @param {Array}  data     - dati da convertire
 * @param {string} filename - nome del file di output (senza estensione)
 * @returns {Promise<string>} percorso del file salvato
 */
function convertToJSON(data, filename) {
  return new Promise((resolve, reject) => {
    try {
      const outputPath = path.join(CONVERTED_DIR, `${filename}.json`);
      const content    = JSON.stringify(data, null, 2);  // null, 2 → pretty print
      fs.writeFileSync(outputPath, content, 'utf-8');
      resolve(outputPath);
    } catch (err) {
      reject(new Error(`Errore nella scrittura JSON: ${err.message}`));
    }
  });
}

/**
 * convertToXML – trasforma un array di oggetti in file XML.
 * Usa xml2js.Builder per costruire l'XML a partire dall'oggetto JS.
 *
 * Struttura prodotta:
 *   <root>
 *     <item> ... </item>
 *     <item> ... </item>
 *   </root>
 *
 * @param {Array}  data     - dati da convertire
 * @param {string} filename - nome del file di output (senza estensione)
 * @returns {Promise<string>} percorso del file salvato
 */
function convertToXML(data, filename) {
  return new Promise((resolve, reject) => {
    try {
      const builder    = new xml2js.Builder({ rootName: 'root' });

      // xml2js si aspetta che il contenuto sia un oggetto con chiave "item"
      const xmlObject  = { item: data };
      const xmlContent = builder.buildObject(xmlObject);

      const outputPath = path.join(CONVERTED_DIR, `${filename}.xml`);
      fs.writeFileSync(outputPath, xmlContent, 'utf-8');
      resolve(outputPath);
    } catch (err) {
      reject(new Error(`Errore nella scrittura XML: ${err.message}`));
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 3 – FUNZIONI DI SUPPORTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getFilePath – restituisce il percorso assoluto di un file nella cartella uploads.
 *
 * @param {string} filename
 * @returns {string}
 */
function getUploadedFilePath(filename) {
  return path.join(UPLOAD_DIR, filename);
}

/**
 * getConvertedFilePath – restituisce il percorso assoluto di un file convertito.
 *
 * @param {string} filename
 * @returns {string}
 */
function getConvertedFilePath(filename) {
  return path.join(CONVERTED_DIR, filename);
}

/**
 * listConvertedFiles – elenca tutti i file presenti in /converted.
 *
 * @returns {Array<string>} lista di nomi file
 */
function listConvertedFiles() {
  return fs.readdirSync(CONVERTED_DIR);
}

/**
 * parseFile – funzione dispatcher: sceglie il parser giusto in base all'estensione.
 *
 * @param {string} filePath  - percorso assoluto del file
 * @param {string} extension - 'json' | 'csv' | 'xml'
 * @returns {Promise<Array>}
 */
async function parseFile(filePath, extension) {
  switch (extension.toLowerCase()) {
    case 'json': return parseJSON(filePath);
    case 'csv':  return parseCSV(filePath);
    case 'xml':  return parseXML(filePath);
    default:
      throw new Error(`Formato non supportato: .${extension}`);
  }
}

/**
 * convertData – funzione dispatcher: sceglie il convertitore giusto.
 *
 * @param {Array}  data       - dati già parsati
 * @param {string} toFormat   - 'json' | 'csv' | 'xml'
 * @param {string} basename   - nome base per il file di output
 * @returns {Promise<string>} percorso del file salvato
 */
async function convertData(data, toFormat, basename) {
  switch (toFormat.toLowerCase()) {
    case 'json': return convertToJSON(data, basename);
    case 'csv':  return convertToCSV(data, basename);
    case 'xml':  return convertToXML(data, basename);
    default:
      throw new Error(`Formato di destinazione non supportato: ${toFormat}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT – rendiamo disponibili le funzioni al controller
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  parseFile,
  convertData,
  getUploadedFilePath,
  getConvertedFilePath,
  listConvertedFiles,
};
