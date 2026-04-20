# Aggregatore Dati — Progetto Esame Node.js

Applicazione web per caricare, convertire e scaricare file nei formati **JSON**, **CSV** e **XML**.

---

## Struttura del progetto

```
aggregatore-dati/
├── app.js                      ← Entry point, configura Express
├── package.json
│
├── models/
│   └── dataModel.js            ← Logica di parsing e conversione
│
├── controllers/
│   └── fileController.js       ← Gestione rotte HTTP (upload, convert, download…)
│
├── views/
│   ├── index.html              ← Frontend (HTML + CSS + JS vanilla)
│   ├── sample.json             ← File di test JSON
│   ├── sample.csv              ← File di test CSV
│   └── sample.xml              ← File di test XML
│
├── uploads/                    ← (creata automaticamente) file caricati
└── converted/                  ← (creata automaticamente) file convertiti
```

---

## Avvio rapido

### 1. Installa le dipendenze

```bash
cd aggregatore-dati
npm install
```

### 2. Avvia il server

```bash
# Modalità normale
npm start

# Modalità sviluppo (riavvio automatico con nodemon)
npm run dev
```

### 3. Apri il browser

```
http://localhost:3000
```

---

## Dipendenze utilizzate

| Pacchetto     | Scopo                                |
|---------------|--------------------------------------|
| `express`     | Framework HTTP                       |
| `multer`      | Gestione upload file multipart       |
| `csv-parser`  | Parsing CSV → array di oggetti JS    |
| `fast-csv`    | Scrittura array di oggetti JS → CSV  |
| `xml2js`      | Parsing e scrittura XML              |

---

## Endpoint REST

| Metodo | Endpoint                          | Descrizione                            |
|--------|-----------------------------------|----------------------------------------|
| POST   | `/upload`                         | Carica un file (campo: `file`)         |
| GET    | `/convert?from=json&to=csv`       | Converte l'ultimo file caricato        |
| GET    | `/download/:filename`             | Scarica un file dalla cartella convert |
| GET    | `/preview?limit=10`               | Anteprima JSON dei dati caricati       |
| GET    | `/files`                          | Lista dei file convertiti              |
| GET    | `/status`                         | Stato corrente dell'app                |

### Conversioni supportate

- JSON → CSV
- JSON → XML
- CSV → JSON
- CSV → XML
- XML → JSON
- XML → CSV

### Esempio con curl

```bash
# Upload
curl -X POST -F "file=@sample.json" http://localhost:3000/upload

# Conversione JSON → CSV
curl "http://localhost:3000/convert?from=json&to=csv"

# Download del file convertito
curl -O "http://localhost:3000/download/sample_to_csv.csv"

# Anteprima dati
curl "http://localhost:3000/preview?limit=5"
```

---

## Note implementative

- I file caricati vengono salvati in `uploads/` con un timestamp nel nome per evitare conflitti.
- I file convertiti vengono salvati in `converted/`.
- L'applicazione mantiene in memoria (variabile `lastUpload`) l'ultimo file caricato e i dati parsati.
- La dimensione massima del file caricabile è **10 MB**.
- I formati accettati in upload sono: `.json`, `.csv`, `.xml`.
