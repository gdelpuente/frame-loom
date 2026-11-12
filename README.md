# Frame Loom

Tool locale per suddividere e allineare sprite sheet per Godot senza convertire le immagini in pixel art. I file non vengono inviati a server esterni: il browser legge e processa i dati localmente; Vite serve soltanto l'applicazione.

## Avvio con Docker

Da questa cartella, con Docker e Compose:

```powershell
docker compose build
docker compose up -d
```

Aprire <http://localhost:5173>. Per test e build, eseguiti nel container:

```powershell
docker compose run --rm app sh -c 'npm ci && npm test && npm run build'
```

Per fermare il servizio: `docker compose stop app`. Compose monta il progetto in `/app`, `input/` in `/data/input` e `output/` in `/data/output`. L'interfaccia gira nel browser e non scrive direttamente nei volumi: scegliere i file dalla cartella `input` dell'host e, se desiderato, salvare i download nella cartella `output` dell'host tramite il browser. Le cartelle possono contenere dati propri; la generazione della fixture sovrascrive i tre file `synthetic-*` indicati sotto.

Alternativa con Node installato: `npm ci`, `npm test`, `npm run build`, `npm run dev`. Il lockfile fissa le dipendenze; l'immagine Docker usa Node 22.14.0.

## Uso

1. Selezionare o trascinare un PNG supportato. Specificare righe, colonne, margini simmetrici X/Y e spaziature, quindi **Applica griglia**. L'area residua deve essere esattamente divisibile. L'ordine è riga per riga, da sinistra a destra.
2. Selezionare un fotogramma cliccando il suo rettangolo nell'anteprima sorgente, oppure scegliendolo dalle miniature. Trascinare un bordo o una maniglia per ridimensionare il rettangolo; i campi X, Y, larghezza e altezza restano disponibili per modifiche precise. I rettangoli possono oltrepassare i confini della griglia e sovrapporsi; l'app non può ricostruire parti già mancanti, tagliate o sovrapposte nella sorgente.
3. La modalità predefinita **Stabilizzazione visiva** cerca una traslazione intera che renda il fotogramma simile al riferimento, usando luminosità e alpha; in alternativa scegliere centro, centro inferiore oppure nessun allineamento. Scegliere il riferimento con numerazione da 1. Impostare lo stesso nome di gruppo per i fotogrammi da allineare tra loro. Il gruppo del riferimento usa quel fotogramma; gli altri usano il loro primo fotogramma con ancora. Le ancore manuali sono coordinate intere relative al rettangolo; gli offset sono correzioni intere aggiuntive. Un'ancora automatica usa il centro arrotondato verso sinistra/alto e, per il centro inferiore, la riga visibile più bassa.
4. Per conservare il movimento verticale di un salto, scegliere **Solo orizzontale**: nessun aggiustamento verticale automatico, anche se un offset Y manuale resta possibile. La soglia alpha (1–255) influenza il calcolo dei limiti e il confronto visivo, non i pixel copiati. Un fotogramma senza pixel alla soglia è indicato come vuoto, resta nell'ordine e non riceve un'ancora automatica; è comunque possibile assegnargli ancora e offset manuali.
5. **Adatta alle viste** mostra automaticamente immagini grandi per intero, con la stessa scala dentro ciascuna coppia; regolare lo zoom manuale (10–800%) per esaminare i dettagli. Sono soltanto scale di visualizzazione: sotto il 100% non tutti i pixel possono essere mostrati. Scacchiera, FPS, pausa e avanzamento non influenzano l'output. Selezionare o modificare un fotogramma mette in pausa. Il rettangolo sorgente è verde, il limite rilevato giallo, l'ancora rossa; l'offset complessivo è riportato sotto l'anteprima. **Ripristina allineamento** azzera ancore manuali, gruppi e correzioni, senza cambiare i rettangoli sorgente.
6. Esportare PNG, ZIP dei singoli PNG, JSON dei metadati o JSON del progetto. Il progetto include il PNG originale in base64 e tutte le correzioni, e si riapre con **Apri progetto**. I download sono nuovi file, non modificano l'originale. Applicare una nuova griglia cancella le correzioni; i valori della griglia ancora non applicati non entrano nel progetto.

## Elaborazione batch

Per elaborare immagini con la stessa griglia e le stesse opzioni, usare **Apri batch** per selezionare più PNG oppure **Apri cartella** per caricare una cartella (anche con sottocartelle), quindi **Elabora batch selezionato**. Ogni immagine viene verificata e processata indipendentemente: un file non valido non impedisce di esportare gli altri. Lo ZIP scaricato contiene, per ogni immagine, lo sprite sheet allineato, i PNG dei singoli fotogrammi e i metadati, oltre a un report degli eventuali errori.

La stessa operazione è disponibile da terminale, elaborando ricorsivamente i PNG e mantenendo i percorsi relativi:

```powershell
npm run batch -- .\input .\output --grid-rows 2 --grid-cols 2 --mode match --reference 1 --output-cols 2
```

Le opzioni di griglia sono `--grid-rows`, `--grid-cols`, `--margin-x`, `--margin-y`, `--gap-x` e `--gap-y`; quelle di allineamento sono `--mode` (`match`, `bottom`, `center`, `none`), `--axis` (`both`, `x`), `--reference` (numerazione da 1), `--threshold` e `--output-cols`. I valori predefiniti elaborano ogni PNG come un solo fotogramma; `--output-cols` predefinito segue le colonne della griglia sorgente. Per ogni file crea una cartella sotto l'output con sheet, metadati e directory `frames`. I file non validi sono segnalati e gli altri continuano; il comando termina con codice non zero se almeno un'immagine non è stata elaborata.

## Qualità e limiti

Il decoder accetta soltanto PNG non interlacciati, colore RGBA a 8 bit, fino a 16.777.216 pixel; anche l'output è limitato a tale numero. PNG RGB, scala di grigi, indicizzati, 16 bit, interlacciati e chunk critici non gestiti vengono rifiutati esplicitamente. I PNG con profili o metadati colore `iCCP`, `sRGB`, `gAMA`, `cHRM`, `cICP`, `mDCV` o `cLLI` vengono rifiutati, senza convertirli o scartarli silenziosamente. Altri metadati non critici non sono conservati nel PNG esportato. Se necessario, preparare una copia compatibile con uno strumento esterno, consapevoli di eventuali conversioni.

Il motore mantiene i valori RGBA decodificati di **tutti** i pixel dei rettangoli selezionati, anche semitrasparenti e RGB sotto alpha zero. Copia tramite sole traslazioni intere e padding trasparente, senza scaling, filtri, quantizzazione, dithering o rimozione dello sfondo. I rettangoli interi, non solo il contenuto sopra soglia, determinano la dimensione delle celle: ciò evita clipping anche degli effetti e dei pixel trasparenti con RGB significativo. Il confronto dei byte del PNG compresso non è significativo. Canvas è usato esclusivamente per la visualizzazione e può mostrare differenze di compositing dei semitrasparenti; non è usato per generare i PNG.

Uno sfondo completamente opaco viene segnalato: il rilevamento alpha considera contenuto l'intero rettangolo. Usare rettangoli e ancore manuali; lo sfondo non viene rimosso. Non esiste rilevamento automatico della griglia né conversione pixel art. Se la sorgente contiene più soggetti nella stessa regione, tutti i pixel vengono conservati e il limite alpha li considera insieme.

La stabilizzazione visiva confronta versioni di analisi a scale 8, 2 e 1, con costo robusto su alpha e luminosità premoltiplicata, cercando spostamenti fino a un ottavo della dimensione del fotogramma (minimo 8, massimo 64 pixel per asse). Le versioni ridotte servono solo alla ricerca; l'esportazione copia sempre i pixel nativi. Nel metodo visivo, l'ancora automatica mostrata è il centro inferiore dei limiti, non il punto usato dal confronto. Un'ancora manuale su un fotogramma sostituisce il confronto con l'allineamento alla corrispondente ancora del riferimento; cambiare solo l'ancora del riferimento non modifica il confronto automatico degli altri. Se il riferimento è vuoto alla soglia ma ha un'ancora manuale, si usano le ancore. Per spostamenti maggiori, immagini molto diverse o motivi ripetuti, il risultato può essere ambiguo: verificare l'anteprima e correggere manualmente. Il metodo può attenuare il movimento intenzionale dell'intero soggetto e non elimina variazioni locali nei disegni; usare solo X o ancore manuali quando necessario. La ricerca può richiedere tempo su immagini grandi.

## Importazione in Godot

Importare lo sprite sheet PNG nel progetto Godot. Nel nodo `Sprite2D` impostare `Hframes` e `Vframes` rispettivamente ai campi `columns` e `rows` del JSON e selezionare `frame`; in alternativa creare una `SpriteFrames` con la griglia, mantenendo l'ordine riga per riga. Dimensioni cella: `cellWidth` × `cellHeight` pixel. Se l'ultima riga non è piena, le celle aggiuntive sono vuote: usare solo `frameCount` fotogrammi. Per pixel art usare il filtro nearest in Godot; per altri stili scegliere il filtro desiderato.

Nel JSON gli indici sono **zero-based**, l'origine è in alto a sinistra e Y cresce verso il basso. `source` è il rettangolo assoluto sul PNG sorgente; `contentBounds` e `anchor` sono relativi al suo angolo superiore sinistro; `destination` è l'angolo assoluto in pixel sul PNG esportato, non l'origine della cella. `shift` è la traslazione prima del padding comune, e `correction` l'offset manuale. Un pixel relativo `(x,y)` viene copiato da `source.x+x, source.y+y` a `destination.x+x, destination.y+y`. `reference` nei singoli frame è l'indice zero-based del riferimento effettivo del gruppo, oppure `null`.

## Fixture, risultati e licenze

La fixture sintetica [`fixtures/synthetic.png`](fixtures/synthetic.png) è RGBA 8 bit, 96 × 32, trasparente con pixel semitrasparenti, griglia 1 × 3, celle 32 × 32, margini e spaziature zero.

[`output/synthetic-aligned.png`](output/synthetic-aligned.png), [`output/synthetic-metadata.json`](output/synthetic-metadata.json) e [`output/synthetic-comparison.html`](output/synthetic-comparison.html) sono risultati sintetici: il confronto HTML contiene un'animazione prima/dopo alla stessa scala. `npm run fixture` li rigenera insieme alla fixture. Dettagli delle prove in [`REPORT.md`](REPORT.md).

L'immagine del coro allegata successivamente è conservata invariata in [`fixtures/coro-alpino.png`](fixtures/coro-alpino.png): PNG RGBA 8 bit, 1024 × 768, griglia 2 × 2, celle sorgente 512 × 384, margini e spaziature zero. Con la modalità visiva e riferimento 1 si ottengono [`output/coro-alpino-allineato.png`](output/coro-alpino-allineato.png), [`output/coro-alpino-metadati.json`](output/coro-alpino-metadati.json) e il [confronto animato](output/coro-alpino-confronto.html). `npm run choir` rigenera e sovrascrive questi tre risultati, senza modificare la fixture.

I repository [spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper) e [ai-sprite-align-tool](https://github.com/zxc02621948-sketch/ai-sprite-align-tool) indicano licenza MIT. Sono stati valutati per finalità e non è stato copiato loro codice: pixel snapping e correzioni AI non servono al percorso richiesto. Dipendenze: fflate (MIT), Vite (MIT) e relative dipendenze elencate nel lockfile.
