# Report verifiche

## Dati

Nel primo test l'allegato non era disponibile. Fixture sintetica: PNG RGBA 8 bit 96 × 32, con trasparenza e pixel semitrasparenti; 1 riga, 3 colonne, margini e spaziature 0. Output con centro inferiore, riferimento 1, entrambi gli assi: PNG 114 × 39, 3 celle 38 × 39. Offset automatici: `(0,0)`, `(-4,4)`, `(2,-3)`.

Successivamente è stato ricevuto il PNG del coro, conservato in `fixtures/coro-alpino.png` (SHA-256 `81486163c87556da990ed8d4435c23a11ef1b7211db4284cb10fd9b9d6196629`): RGBA 8 bit, 1024 × 768, con trasparenza; griglia 2 × 2, celle 512 × 384, nessun margine o spaziatura. I limiti alpha a soglia 1 includono pixel quasi trasparenti lontani dai personaggi. Con stabilizzazione visiva, riferimento 1 e assi X/Y, gli spostamenti sono `(0,0)`, `(22,1)`, `(0,-7)`, `(21,-7)`; l'output è 1068 × 784, celle 534 × 392.

## Verifiche eseguite

- `npm test`: 14 test superati. Inclusi confronto byte RGBA di ogni rettangolo alla destinazione indicata dal JSON, valori semitrasparenti e RGB sotto alpha zero, identità senza allineamento, nessun clipping, ordine, celle, ancore manuali e gruppi, asse X per salti, frame vuoti, soglia e riproducibilità degli output salvati. Per il coro sono confrontati i byte RGBA di tutte le righe copiate e i metadati del PNG generato.
- PNG generato controllato anche decomprimendo IDAT con `node:zlib`, indipendentemente dal decoder dell'app; tutti e cinque i filtri di riga PNG provati con stream zlib indipendente.
- `npm run build`: riuscita. Anche `docker compose build` e `docker compose run --rm app sh -c 'npm ci && npm test && npm run build'` sono riusciti, con 14 test superati.
- Browser integrato: importazione della fixture, evento drop simulato, configurazione griglia, selezione fotogramma, modifica di rettangolo, ancora e offset, modalità solo X, riproduzione a 2 FPS, pausa e avanzamento, generazione dei quattro Blob di esportazione e ricarica del progetto. Il PNG generato dal flusso UI è stato decodificato e confrontato pixel per pixel usando le coordinate JSON; ZIP contiene 3 PNG e metadati. Ricaricati ancora `(12,20)` e offset X `2`.
- Sul coro, un confronto indipendente tra ciascun frame e il riferimento, somma delle differenze assolute di alpha e RGB premoltiplicato nelle celle, passa da 75.318.393 con centro inferiore a 24.749.526 con stabilizzazione visiva: circa **67% in meno**. Confrontando invece fotogrammi consecutivi, incluso l'ultimo con il primo, la stessa misura scende da 107.287.332 a 31.470.614: circa **71% in meno**. Non è una misura percettiva universale né garantisce l'eliminazione di ogni oscillazione.
- Nel browser il coro è stato importato con griglia 2 × 2: viste intere senza scorrimento alla scala automatica, zoom manuale 50%, offset manuale e ricarica del progetto verificati. Il PNG prodotto dalla UI è stato confrontato pixel per pixel con la sorgente tramite coordinate JSON. Il confronto animato salvato è stato aperto nel browser.

## Controlli non eseguiti o limitati

- Nessuna importazione effettiva in Godot.
- Nel browser integrato non è stato possibile verificare il salvataggio fisico del download: l'evento download non è stato esposto dal test; sono stati ispezionati i Blob generati dai pulsanti. Il drag-and-drop è stato simulato, non provato trascinando un file dal sistema operativo.
- I test verificano i byte RGBA decodificati, non la resa cromatica di monitor o viewer; il percorso Canvas delle anteprime può effettuare compositing.
