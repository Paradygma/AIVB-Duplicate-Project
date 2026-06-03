# DuplicateProject - AIVB

Microservizio TypeScript/Express che duplica un progetto Notion creando la
successiva versione `Vn`.

## Flusso

```text
Pulsante Notion
-> POST /webhook/duplicate-project
-> copia progetto
-> copia costi esterni
-> copia milestone
-> copia task
-> ricostruzione gerarchia e dipendenze task
```

La nuova versione mantiene condivisi cliente, preventivo originale, figure
professionali, persone allocate, documenti, report settimanali, consuntivi e
time entries. Non duplica i blocchi interni delle pagine Notion.

## Setup

```bash
npm install
cp .env.example .env
```

Compila `.env` senza commettere il file:

```text
NOTION_TOKEN=secret_xxx
WEBHOOK_SECRET=<stringa-random-di-almeno-32-caratteri>
```

Condividi con l'integrazione Notion i database:

```text
Progetti - AIVB
Task - AIVB
Milestone - AIVB
Costi Esterni - AIVB
```

## Automazione Notion

Il database `Progetti - AIVB` deve contenere:

```text
stato duplicazione: select con In corso, Completata, Errore
Log Duplicazione: text
```

Configura il pulsante nel database `Progetti - AIVB`:

```text
POST https://<host>/webhook/duplicate-project
X-Webhook-Secret: <WEBHOOK_SECRET>
Content-Type: application/json
```

Body:

```json
{
  "pageId": "{{trigger.page_id}}"
}
```

## Sviluppo

```bash
npm run dev
npm test
npm run typecheck
npm run build
```

Test manuale:

```bash
curl -X POST http://localhost:3000/webhook/duplicate-project \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"pageId":"<test-project-page-id>"}'
```

## Errori

Il progetto sorgente viene aggiornato durante il flusso:

```text
In corso
Completata
Errore
```

In caso di errore i record parziali restano disponibili per ispezione e
`Log Duplicazione` contiene fase, timestamp e messaggio sintetico.

## Limite Noto

Il controllo `stato duplicazione = In corso` riduce i clic duplicati, ma non e
un lock distribuito atomico tra piu istanze serverless.

## Dry Run

Verifica con un progetto contenente:

```text
- due milestone
- task padre e sotto-task
- una dipendenza Blocked by
- un costo esterno
- cliente e preventivo originale
- figura professionale e persona allocata
- almeno un record storico condiviso
```

Controlla che modificare task e costi della nuova versione non modifichi il
progetto sorgente.
