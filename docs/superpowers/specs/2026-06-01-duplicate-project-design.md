# DuplicateProject - Design Specification

## Obiettivo

Creare un microservizio TypeScript/Express che duplichi un progetto Notion quando
un utente preme un pulsante nel database `Progetti - AIVB`.

La duplicazione crea una nuova versione indipendente della pianificazione e dei
costi esterni. I dati di riferimento e lo storico operativo restano condivisi
con il progetto sorgente. La nuova versione e identificata dal nome:

```text
<Nome progetto base> - V2
<Nome progetto base> - V3
...
```

Non vengono aggiunte proprieta Notion dedicate alla catena delle versioni.

## Contesto

Il servizio verra creato in:

```text
/Users/mirkopapadopoli/Code/PARADYGMA/AIVB/DuplicateProject
```

Prende come riferimento il pattern gia usato da `SessionExport-STORIES`:

```text
Pulsante Notion
-> automazione Notion
-> webhook autenticato
-> handler applicativo
-> chiamate Notion API
-> aggiornamento stato sul record sorgente
```

Il primo rilascio usa un'orchestrazione sincrona. Il codice deve separare la
logica di clonazione dal trasporto HTTP, in modo da consentire un futuro
spostamento verso un worker asincrono senza riscrivere il dominio.

## Database Notion

Pagina contenitore:

```text
https://www.notion.so/paradygma/Database-Source-3458632247398093ba82cc3736b14866
```

Database coinvolti direttamente:

| Database | Database ID | Data source ID |
| --- | --- | --- |
| Progetti - AIVB | `15de1529b88c4c8585f7fa99e40b2bc5` | `fba0b90a-a98d-4e14-888c-350e7f5cf905` |
| Task - AIVB | `c81fe70015114faf9926085a112b3252` | `d40e0cdd-69c2-4f5e-a7e0-51627e5b316b` |
| Milestone - AIVB | `de6f34c8e3eb42fc93933e696542e4fe` | `1af18b34-ada3-4b0e-966b-0d3310c54884` |
| Costi Esterni - AIVB | `358a3720c3fe4d12aa3f375154f1b558` | `2c2de5c3-fc0b-41ee-a753-78412d1865e2` |

Database collegati ma non clonati:

| Database | Comportamento |
| --- | --- |
| Preventivi - AIVB | relazione condivisa verso il preventivo originale |
| Righe Preventivo - AIVB | non clonato |
| Figure Professionali - AIVB | record condivisi |
| Persone - AIVB | record condivisi |
| Clienti - AIVB | record condivisi |
| Consuntivi - AIVB | record condivisi |
| Time Entries - AIVB | record condivisi |
| Report Settimanali - AIVB | record condivisi |
| Documenti - AIVB | record condivisi |

## Configurazione Notion

Il database `Progetti - AIVB` contiene:

| Proprieta | Tipo | Valori |
| --- | --- | --- |
| `stato duplicazione` | select | `In corso`, `Completata`, `Errore` |
| `Log Duplicazione` | text | messaggio diagnostico in caso di errore |

Il pulsante Notion deve attivare un'automazione con:

```text
POST /webhook/duplicate-project
X-Webhook-Secret: <WEBHOOK_SECRET>
Content-Type: application/json
```

Payload:

```json
{
  "pageId": "{{trigger.page_id}}"
}
```

## Endpoint

Il servizio espone:

```text
GET  /health
POST /webhook/duplicate-project
```

Il webhook:

1. verifica `X-Webhook-Secret` con confronto timing-safe;
2. valida il payload con Zod;
3. verifica che `pageId` sia un record del database `Progetti - AIVB`;
4. rifiuta la richiesta se `stato duplicazione` e gia `In corso`;
5. avvia la duplicazione sincrona;
6. risponde con esito e ID del nuovo progetto.

## Naming Delle Versioni

Il servizio calcola il nome della nuova versione automaticamente.

Esempi:

```text
Progetto Alfa       -> Progetto Alfa - V2
Progetto Alfa - V2  -> Progetto Alfa - V3
Progetto Alfa - V4  -> Progetto Alfa - V5
```

Algoritmo:

1. rimuovere l'eventuale suffisso finale ` - V<number>`;
2. interrogare `Progetti - AIVB` per individuare i nomi con la stessa base;
3. estrarre i suffissi esistenti;
4. scegliere il numero massimo piu uno, con minimo `V2`;
5. verificare nuovamente che il nome non esista prima della creazione.

## Perimetro Della Duplicazione

### Progetto

Il nuovo progetto copia le proprieta scrivibili del sorgente:

- titolo, descrizione, tipo;
- date previste;
- responsabile;
- cliente;
- figure professionali;
- preventivo originale;
- consuntivi;
- time entries;
- report settimanali;
- documenti.

Non vengono copiati:

- formule;
- rollup;
- proprieta di sistema;
- pulsanti;
- `stato duplicazione`;
- `Log Duplicazione`;
- blocchi contenuti nella pagina Notion.

Le relazioni verso task, milestone e costi esterni vengono costruite usando i
record clonati.

### Costi Esterni

Ogni costo esterno collegato al progetto sorgente viene clonato e collegato al
nuovo progetto.

Campi copiati:

- `Descrizione`;
- `Categoria`;
- `Frequenza`;
- `Durata`;
- `Costo`;
- `Note`;
- `Ribaltato`;
- relazione condivisa al preventivo originale, se presente.

### Milestone

Ogni milestone collegata al progetto sorgente viene clonata e collegata al
nuovo progetto.

Campi copiati:

- `Nome Milestone`;
- `Descrizione`;
- `Status`;
- `Data Inizio`;
- `Data Fine`.

La relazione ai task viene ricostruita dopo la clonazione dei task.

### Task

Ogni task collegato al progetto sorgente viene clonato come fotografia completa
dello stato corrente.

Campi copiati:

- `Nome Task`;
- `Descrizione`;
- `Status`;
- `Priorità`;
- `Data Inizio`;
- `Data fine 2`;
- `Durata Pianificata`;
- `Ore Stimate`;
- `% Allocazione Preventivata`;
- `Assegnato a`;
- `Assegnatario`;
- `Persona Allocata`;
- `Figura Professionale`;
- relazioni condivise verso consuntivi e time entries.

Le relazioni interne vengono ricostruite in una seconda fase:

- `Milestone`;
- `Parent item`;
- `Sub-item`;
- `Blocked by`;
- `Blocking`.

Ogni relazione interna deve puntare esclusivamente ai nuovi record, mai ai task
o alle milestone sorgenti.

## Orchestrazione

Il servizio usa mappe temporanee in memoria:

```text
milestoneMap: originalMilestoneId -> clonedMilestoneId
taskMap: originalTaskId -> clonedTaskId
costMap: originalCostId -> clonedCostId
```

Flusso:

```text
1. Carica e valida progetto sorgente
2. Blocca richieste concorrenti con stato duplicazione = "In corso"
3. Svuota Log Duplicazione
4. Calcola nome versione
5. Crea nuovo progetto con relazioni condivise
6. Clona costi esterni e popola costMap
7. Clona milestone senza task e popola milestoneMap
8. Clona task senza relazioni interne e popola taskMap
9. Aggiorna task clonati con milestone, gerarchia e dipendenze rimappate
10. Imposta stato duplicazione = "Completata" sul progetto sorgente
11. Restituisce ID e URL del nuovo progetto
```

## Errori

In caso di errore:

1. i record gia creati restano disponibili per ispezione;
2. il progetto sorgente viene aggiornato con `stato duplicazione = Errore`;
3. `Log Duplicazione` riceve un messaggio sintetico;
4. i log applicativi JSON conservano il dettaglio tecnico.

Formato consigliato per `Log Duplicazione`:

```text
[2026-06-01T16:00:00.000Z] Fase: clone_tasks. Errore: <messaggio>
```

Il messaggio destinato a Notion non deve includere token, secret o payload
sensibili.

## Retry E Limiti

Le chiamate Notion API devono:

- usare paginazione per tutte le query;
- riprovare errori `429` e `5xx`;
- applicare un numero massimo di tentativi;
- introdurre attesa incrementale tra i retry;
- produrre log strutturati per fase.

L'orchestrazione sincrona e adatta al primo rilascio. Se i progetti reali
superano regolarmente i timeout HTTP della piattaforma, il passo successivo
sara introdurre una coda e un worker asincrono mantenendo invariati i moduli di
clonazione.

## Concorrenza

Il servizio rifiuta una richiesta se il progetto sorgente ha gia:

```text
stato duplicazione = In corso
```

Aggiorna lo stato a `In corso` prima di creare record. Il controllo riduce i
duplicati accidentali, ma non costituisce un lock distribuito atomico tra
istanze serverless. Questa e una limitazione accettata per il primo rilascio.

## Struttura Del Codice

Struttura prevista:

```text
src/
  index.ts
  config/env.ts
  routes/webhook.ts
  handlers/duplicateProjectHandler.ts
  notion/client.ts
  notion/query.ts
  notion/retry.ts
  notion/projectRepository.ts
  notion/taskRepository.ts
  notion/milestoneRepository.ts
  notion/externalCostRepository.ts
  notion/propertyMapper.ts
  services/versionName.ts
  services/duplicateProject.ts
  utils/logger.ts
```

Responsabilita:

- route: autenticazione e validazione HTTP;
- handler: traduzione esito applicativo in risposta HTTP;
- service: orchestrazione della duplicazione;
- repository: query e mutazioni Notion specifiche per database;
- mapper: copia delle sole proprieta scrivibili;
- retry: gestione uniforme degli errori temporanei;
- logger: eventi JSON strutturati.

## Test

Test automatici:

- generazione nomi `V2`, `V3`, `Vn`;
- estrazione della base da un nome gia versionato;
- copia delle sole proprieta scrivibili;
- rimappatura task padre e sotto-task;
- rimappatura `Blocked by` e `Blocking`;
- rimappatura task-milestone;
- payload errato;
- secret errato;
- blocco con `stato duplicazione = In corso`;
- gestione dell'errore e scrittura in `Log Duplicazione`.

Verifica manuale:

1. creare un progetto test;
2. collegare almeno due milestone;
3. aggiungere task padre, sotto-task e dipendenza tra task;
4. aggiungere almeno un costo esterno;
5. collegare cliente, preventivo, figura professionale e persona;
6. collegare almeno un record storico condiviso;
7. premere il pulsante;
8. verificare nome versione, copie indipendenti e relazioni rimappate;
9. modificare un task e un costo della nuova versione;
10. verificare che la versione sorgente non cambi.

## Criteri Di Accettazione

La funzionalita e completata quando:

- il pulsante crea automaticamente la prossima versione disponibile;
- la nuova versione mantiene le relazioni condivise richieste;
- costi esterni, milestone e task sono copie indipendenti;
- gerarchia task e dipendenze puntano solo ai record clonati;
- le formule e i rollup vengono ricalcolati da Notion;
- clic ripetuti durante `In corso` non avviano nuove duplicazioni;
- gli errori lasciano record ispezionabili e aggiornano `Log Duplicazione`;
- il servizio passa typecheck e test automatici;
- un dry-run manuale soddisfa il caso di verifica definito sopra.

## Fuori Perimetro

Non fanno parte del primo rilascio:

- duplicazione di preventivi o righe preventivo;
- duplicazione dei blocchi interni delle pagine;
- rollback automatico dei record parziali;
- coda di job o worker asincrono;
- lock distribuito esterno;
- proprieta dedicate alla catena delle versioni.
