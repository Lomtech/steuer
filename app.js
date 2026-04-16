/* ==========================================================================
   Stiftungssteuer — Berechnungslogik
   VZ 2025 · Stand: geltendes Recht
   ========================================================================== */

/* ---------- Konstanten (VZ 2026 · Steueränderungsgesetz 2025) ---------- */
const CONST = {
    FREIGRENZE_GB: 45000,        // § 64 Abs. 3 AO (ab 01.01.2026, vorher 45.000)
    KST_FREIBETRAG: 5000,        // § 24 KStG
    GEWST_FREIBETRAG: 5000,      // § 11 Abs. 1 S. 3 Nr. 2 GewStG (gemeinn. Körperschaften)
    KST_SATZ: 0.15,              // § 23 KStG
    SOLI_SATZ: 0.055,            // SolZG
    GEWST_MESSZAHL: 0.035,       // § 11 II GewStG
    UST_ERMAESSIGT: 0.07,        // § 12 II UStG
    UST_REGEL: 0.19,             // § 12 I UStG
    KLEIN_VORJAHR: 25000,        // § 19 I UStG (ab 2025, vorher 22.000)
    KLEIN_LAUFEND: 100000,       // § 19 I UStG (ab 2025, vorher 50.000)
    MITTEL_FREIGRENZE: 100000,   // § 55 I Nr. 5 S. 4 AO (ab 2026) — unterhalb keine zeitnahe Mittelverwendungspflicht
    FREIE_RUECKLAGE_VV_QUOTE: 1 / 3,   // § 62 I Nr. 3 AO
    FREIE_RUECKLAGE_SONST_QUOTE: 0.10
};

/* ---------- Formatierer ---------- */
const fmtEUR = new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2
});
const fmtPct = new Intl.NumberFormat('de-DE', {
    style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1
});
const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
};

const num = (el) => {
    const v = parseFloat((el?.value || '').toString().replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
};

/* ==========================================================================
   TAB-NAVIGATION
   ========================================================================== */
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t === tab));
        document.querySelectorAll('.panel').forEach(p =>
            p.classList.toggle('is-active', p.dataset.panel === target)
        );
    });
});

/* ==========================================================================
   MODUL 01 · SPHÄRENRECHNUNG
   ========================================================================== */
function calcSpheres() {
    const spheres = ['ideal', 'asset', 'purpose', 'biz'];
    const results = {};

    spheres.forEach(s => {
        const inEl = document.querySelector(`[data-sphere="${s}"][data-kind="in"]`);
        const outEl = document.querySelector(`[data-sphere="${s}"][data-kind="out"]`);
        const income = num(inEl);
        const expense = num(outEl);
        const saldo = income - expense;

        results[s] = { income, expense, saldo };

        const out = document.querySelector(`[data-sphere-result="${s}"]`);
        if (out) out.textContent = fmtEUR.format(saldo);
    });

    /* Freigrenze § 64 III AO — Bruttoeinnahmen wGB */
    const grossBiz = results.biz.income;
    const freigrenzeBox = document.getElementById('freigrenze-box');
    const freigrenzeVal = document.querySelector('[data-freigrenze-value]');
    const freigrenzeText = document.getElementById('freigrenze-text');

    freigrenzeVal.textContent = fmtEUR.format(grossBiz);

    freigrenzeBox.classList.remove('is-ok', 'is-warn');
    if (grossBiz === 0) {
        freigrenzeText.innerHTML = `Bruttoeinnahmen aus wGB: <strong data-freigrenze-value>${fmtEUR.format(grossBiz)}</strong> — Schwellenwert 50.000 €. Bitte Einnahmen erfassen.`;
    } else if (grossBiz <= CONST.FREIGRENZE_GB) {
        freigrenzeBox.classList.add('is-ok');
        freigrenzeText.innerHTML = `Bruttoeinnahmen wGB: <strong>${fmtEUR.format(grossBiz)}</strong> — <strong>unterhalb</strong> der Freigrenze von 50.000 €. Keine KSt/GewSt auf den wGB.`;
    } else {
        freigrenzeBox.classList.add('is-warn');
        freigrenzeText.innerHTML = `Bruttoeinnahmen wGB: <strong>${fmtEUR.format(grossBiz)}</strong> — <strong>oberhalb</strong> 50.000 €. wGB wird voll steuerpflichtig.`;
    }

    return results;
}

/* ==========================================================================
   MODUL 02 · STEUERN
   ==========================================================================
   Wichtig zur Brutto/Netto-Logik:
   - Einnahmen im wGB werden als BRUTTO (inkl. USt) erfasst, weil § 64 III AO
     explizit von "Einnahmen einschließlich Umsatzsteuer" spricht.
   - USt wird beim wGB daher aus dem Brutto herausgerechnet (÷ 1,19).
   - Für die KSt/GewSt-Gewinnermittlung zählt der Netto-Gewinn.
   - Vermögensverwaltung und Zweckbetrieb werden vereinfachend als Netto
     behandelt (7 % USt wird on-top gerechnet). In der Praxis kann der Nutzer
     die Werte entsprechend anpassen.
   ========================================================================== */
function calcTaxes(spheres) {
    /* --- Brutto/Netto-Split wGB --- */
    const grossBiz = spheres.biz.income;          // Brutto § 64 III AO
    const kstPflichtig = grossBiz > CONST.FREIGRENZE_GB;

    // Bei Kleinunternehmer oder unter Freigrenze: keine USt aus wGB herausrechnen
    const klein = document.getElementById('kleinunternehmer').checked;
    const ustRateBiz = klein ? 0 : CONST.UST_REGEL;
    const netBiz = klein ? grossBiz : grossBiz / (1 + ustRateBiz);
    const ustBiz = grossBiz - netBiz;

    // Netto-Gewinn wGB für KSt/GewSt
    const profitNet = Math.max(0, netBiz - spheres.biz.expense);

    /* --- KSt --- */
    const kstBase = kstPflichtig ? Math.max(0, profitNet - CONST.KST_FREIBETRAG) : 0;
    const kst = kstBase * CONST.KST_SATZ;
    const soli = kst * CONST.SOLI_SATZ;
    const kstTotal = kst + soli;

    setOut('profit', fmtEUR.format(profitNet));
    setOut('kst-freibetrag', kstPflichtig ? fmtEUR.format(CONST.KST_FREIBETRAG) : fmtEUR.format(0));
    setOut('kst-base', fmtEUR.format(kstBase));
    setOut('kst', fmtEUR.format(kst));
    setOut('soli', fmtEUR.format(soli));
    setOut('kst-total', fmtEUR.format(kstTotal));

    /* --- GewSt --- */
    // § 11 Abs. 1 S. 3 GewStG: Gewerbeertrag wird auf volle 100 € abgerundet VOR Freibetrag
    const hebesatz = num(document.getElementById('hebesatz')) / 100;
    const gewertragGerundet = kstPflichtig ? Math.floor(profitNet / 100) * 100 : 0;
    const gewBase = Math.max(0, gewertragGerundet - CONST.GEWST_FREIBETRAG);
    const messbetrag = gewBase * CONST.GEWST_MESSZAHL;
    const gewst = messbetrag * hebesatz;

    setOut('gew-profit', fmtEUR.format(gewertragGerundet));
    setOut('gew-base', fmtEUR.format(gewBase));
    setOut('gew-messbetrag', fmtEUR.format(messbetrag));
    setOut('gew-total', fmtEUR.format(gewst));

    /* --- USt --- */
    // Vermögensverwaltung und Zweckbetrieb: Eingabe = Netto, 7% on-top
    // wGB: Eingabe = Brutto, USt aus Brutto herausgerechnet
    const assetNet = spheres.asset.income;
    const assetTax = klein ? 0 : assetNet * CONST.UST_ERMAESSIGT;
    const assetGross = assetNet + assetTax;

    const purposeNet = spheres.purpose.income;
    const purposeTax = klein ? 0 : purposeNet * CONST.UST_ERMAESSIGT;
    const purposeGross = purposeNet + purposeTax;

    setOut('asset-net', fmtEUR.format(assetNet), 'ust');
    setOut('asset-tax', fmtEUR.format(assetTax), 'ust');
    setOut('asset-gross', fmtEUR.format(assetGross), 'ust');

    setOut('purpose-net', fmtEUR.format(purposeNet), 'ust');
    setOut('purpose-tax', fmtEUR.format(purposeTax), 'ust');
    setOut('purpose-gross', fmtEUR.format(purposeGross), 'ust');

    setOut('biz-net', fmtEUR.format(netBiz), 'ust');
    setOut('biz-tax', fmtEUR.format(ustBiz), 'ust');
    setOut('biz-gross', fmtEUR.format(grossBiz), 'ust');

    const totalNet = assetNet + purposeNet + netBiz;
    const totalTax = assetTax + purposeTax + ustBiz;
    const totalGross = assetGross + purposeGross + grossBiz;

    setOut('total-net', fmtEUR.format(totalNet), 'ust');
    setOut('total-tax', fmtEUR.format(totalTax), 'ust');
    setOut('total-gross', fmtEUR.format(totalGross), 'ust');

    /* Kleinunternehmer-Hinweis auf Basis § 19 UStG (Netto-Gesamtumsatz) */
    const hint = document.getElementById('kleinunternehmer-hint');
    const gesamtumsatzNetto = assetNet + purposeNet + netBiz;
    if (gesamtumsatzNetto > CONST.KLEIN_LAUFEND) {
        hint.innerHTML = `<strong style="color:var(--coral)">Netto-Gesamtumsatz ${fmtEUR.format(gesamtumsatzNetto)}</strong> überschreitet 100.000 € — Kleinunternehmerregelung nicht anwendbar.`;
    } else if (gesamtumsatzNetto > CONST.KLEIN_VORJAHR) {
        hint.innerHTML = `<strong style="color:var(--ochre)">Netto-Gesamtumsatz ${fmtEUR.format(gesamtumsatzNetto)}</strong> überschreitet 25.000 € (Vorjahresgrenze) — nur anwendbar wenn Vorjahr ≤ 25.000 € war.`;
    } else {
        hint.innerHTML = `Prüfung gegen 25.000 € (Vorjahr) / 100.000 € (laufend). Bei Aktivierung keine USt-Erhebung.`;
    }

    /* --- Summary --- */
    const grandTotal = kstTotal + gewst + totalTax;
    setOut('grand-total', fmtEUR.format(grandTotal));

    const effRate = profitNet > 0 ? (kstTotal + gewst) / profitNet : 0;
    setOut('effective-rate', fmtPct.format(effRate));
}

function setOut(key, val, scope = 'tax') {
    const el = document.querySelector(`[data-${scope}="${key}"]`);
    if (el) el.textContent = val;
}

/* ==========================================================================
   MODUL 03 · MITTELVERWENDUNG & RÜCKLAGEN
   ========================================================================== */
function calcReserves(spheres) {
    const zVorjahr = num(document.getElementById('zufluss-vorjahr'));
    const zLaufend = num(document.getElementById('zufluss-laufend'));
    const zSum = zVorjahr + zLaufend;
    document.getElementById('zufluss-sum').textContent = fmtEUR.format(zSum);

    const verwendet = num(document.getElementById('verwendet'));
    const rFrei = num(document.getElementById('ruecklage-frei'));
    const rZweck = num(document.getElementById('ruecklage-zweck'));
    const rWbr = num(document.getElementById('ruecklage-wbr'));

    /* --- Freie Rücklage § 62 I Nr. 3 --- */
    const ueberschussVV = Math.max(0, spheres.asset.saldo);
    const maxAusVV = ueberschussVV * CONST.FREIE_RUECKLAGE_VV_QUOTE;
    // Sonstige Mittel = Ideell + Zweckbetrieb + wGB-Gewinn (vereinfacht)
    const sonstige = Math.max(0, spheres.ideal.saldo)
        + Math.max(0, spheres.purpose.saldo)
        + Math.max(0, spheres.biz.saldo);
    const maxAusSonst = sonstige * CONST.FREIE_RUECKLAGE_SONST_QUOTE;
    const maxFrei = maxAusVV + maxAusSonst;

    const freieCheck = document.querySelector('[data-check="freie"]');
    const freieDetail = document.querySelector('[data-detail="freie"]');
    freieCheck.classList.remove('check--ok', 'check--err', 'check--pending');

    freieDetail.innerHTML = `Höchstbetrag: <strong>${fmtEUR.format(maxFrei)}</strong> · Gebildet: <strong>${fmtEUR.format(rFrei)}</strong>`;

    if (rFrei === 0 && maxFrei === 0) {
        freieCheck.classList.add('check--pending');
    } else if (rFrei <= maxFrei + 0.01) {
        freieCheck.classList.add('check--ok');
        freieDetail.innerHTML += ` · <em style="color:var(--moss);font-style:normal">✓ zulässig</em>`;
    } else {
        freieCheck.classList.add('check--err');
        freieDetail.innerHTML += ` · <em style="color:var(--coral);font-style:normal">Überschritten um ${fmtEUR.format(rFrei - maxFrei)}</em>`;
    }

    /* --- Zeitnahe Verwendung § 55 I Nr. 5 AO --- */
    const gebunden = verwendet + rFrei + rZweck + rWbr;
    const verbleibend = zSum - gebunden;

    const verwCheck = document.querySelector('[data-check="verwendung"]');
    const verwDetail = document.querySelector('[data-detail="verwendung"]');
    verwCheck.classList.remove('check--ok', 'check--err', 'check--pending');

    // Neue Freigrenze 100.000 € (§ 55 I Nr. 5 S. 4 AO ab 2026):
    // Gesamtmittel der Körperschaft sind maßgeblich (alle Sphären + Spenden)
    const gesamtmittel = spheres.ideal.income + spheres.asset.income
        + spheres.purpose.income + spheres.biz.income;
    const unterFreigrenze = gesamtmittel < CONST.MITTEL_FREIGRENZE;

    verwDetail.innerHTML = `Zugeflossen: <strong>${fmtEUR.format(zSum)}</strong> · Verwendet/Rücklage: <strong>${fmtEUR.format(gebunden)}</strong> · Verbleibend: <strong>${fmtEUR.format(verbleibend)}</strong>`;

    if (unterFreigrenze && gesamtmittel > 0) {
        verwCheck.classList.add('check--ok');
        verwDetail.innerHTML += ` · <em style="color:var(--moss);font-style:normal">✓ unter 100.000 € Gesamteinnahmen — keine Pflicht zur zeitnahen Mittelverwendung (§ 55 I Nr. 5 S. 4 AO)</em>`;
    } else if (zSum === 0) {
        verwCheck.classList.add('check--pending');
    } else if (Math.abs(verbleibend) < 0.01 || verbleibend < 0) {
        verwCheck.classList.add('check--ok');
        verwDetail.innerHTML += ` · <em style="color:var(--moss);font-style:normal">✓ zeitnah verwendet</em>`;
    } else {
        verwCheck.classList.add('check--err');
        verwDetail.innerHTML += ` · <em style="color:var(--coral);font-style:normal">⚠ Gemeinnützigkeit gefährdet</em>`;
    }
}

/* ==========================================================================
   MODUL 04 · ZUWENDUNGSBESTÄTIGUNG
   ========================================================================== */
function numberToGermanWords(n) {
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n === 0) return 'Null Euro';

    const euros = Math.floor(n);
    const cents = Math.round((n - euros) * 100);

    const ones = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun',
        'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
    const tens = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

    function under1000(n) {
        if (n === 0) return '';
        if (n < 20) return ones[n];
        if (n < 100) {
            const t = Math.floor(n / 10), o = n % 10;
            return (o > 0 ? ones[o] + 'und' : '') + tens[t];
        }
        const h = Math.floor(n / 100), r = n % 100;
        return ones[h] + 'hundert' + (r > 0 ? under1000(r) : '');
    }

    function spell(n) {
        if (n === 0) return 'null';
        if (n < 1000) return under1000(n);
        if (n < 1000000) {
            const th = Math.floor(n / 1000), r = n % 1000;
            const thPart = (th === 1) ? 'eintausend' : under1000(th) + 'tausend';
            return thPart + (r > 0 ? under1000(r) : '');
        }
        const m = Math.floor(n / 1000000), r = n % 1000000;
        const mPart = (m === 1) ? 'eine Million ' : under1000(m) + ' Millionen ';
        return mPart + (r > 0 ? spell(r) : '');
    }

    const euroText = spell(euros).replace(/^ein$/, 'ein');
    let out = euroText.charAt(0).toUpperCase() + euroText.slice(1) + ' Euro';
    if (cents > 0) out += ' und ' + under1000(cents) + ' Cent';
    return out;
}

function updateAmountWords() {
    const amount = num(document.getElementById('d-amount'));
    document.getElementById('d-amount-words').textContent =
        amount > 0 ? numberToGermanWords(amount) : '—';
}

function renderReceipt() {
    const f = (id) => document.getElementById(id).value.trim();
    const issuerName = f('d-issuer-name') || '[Name der Stiftung]';
    const issuerAddr = f('d-issuer-addr') || '[Anschrift]';
    const fsDate = f('d-fs-date') || '[Datum]';
    const fsFA = f('d-fs-fa') || '[FA · StNr]';
    const donorName = f('d-donor-name') || '[Zuwendender]';
    const donorAddr = f('d-donor-addr') || '[Anschrift]';
    const amount = num(document.getElementById('d-amount'));
    const amountWords = numberToGermanWords(amount);
    const date = fmtDate(f('d-date')) || '[TT.MM.JJJJ]';
    const kind = f('d-kind') || 'Geldzuwendung';
    const purpose = f('d-purpose') || '[Förderungszweck]';

    const html = `
    <div class="receipt__section">
      <span class="receipt__label">Aussteller</span>
      <p><strong>${issuerName}</strong><br>${issuerAddr}</p>
    </div>

    <div class="receipt__section">
      <span class="receipt__label">Bestätigung über die Zuwendung gem. § 50 EStDV</span>
      <p>Art der Zuwendung: <strong>${kind}</strong></p>
    </div>

    <div class="receipt__section">
      <span class="receipt__label">Zuwendender</span>
      <p><strong>${donorName}</strong><br>${donorAddr}</p>
    </div>

    <div class="receipt__section">
      <span class="receipt__label">Betrag der Zuwendung</span>
      <p class="receipt__amount">${fmtEUR.format(amount)}</p>
      <p><em>${amountWords}</em></p>
      <p>Tag der Zuwendung: <strong>${date}</strong></p>
    </div>

    <div class="receipt__section">
      <p>Wir sind wegen Förderung <strong>${purpose}</strong> nach dem Freistellungsbescheid des Finanzamts <strong>${fsFA}</strong> vom <strong>${fsDate}</strong> für den letzten Veranlagungszeitraum nach § 5 Abs. 1 Nr. 9 KStG von der Körperschaftsteuer und nach § 3 Nr. 6 GewStG von der Gewerbesteuer befreit.</p>
      <p>Es wird bestätigt, dass die Zuwendung nur zur Förderung steuerbegünstigter Zwecke verwendet wird.</p>
    </div>

    <div class="receipt__sign">
      <div>Ort, Datum</div>
      <div>Unterschrift des Ausstellers</div>
    </div>
  `;

    document.querySelector('#receipt-preview .receipt__body').innerHTML = html;
}

/* ==========================================================================
   EVENT WIRING
   ========================================================================== */
function recalcAll() {
    const spheres = calcSpheres();
    calcTaxes(spheres);
    calcReserves(spheres);
}

// Live-Berechnung bei jedem Input im Sphären-/Steuer-/Rücklagen-Bereich
document.querySelectorAll(
    '[data-sphere], #hebesatz, #kleinunternehmer, ' +
    '#zufluss-vorjahr, #zufluss-laufend, #verwendet, ' +
    '#ruecklage-frei, #ruecklage-zweck, #ruecklage-wbr'
).forEach(el => {
    el.addEventListener('input', recalcAll);
    el.addEventListener('change', recalcAll);
});

// Zuwendungsbestätigung
document.getElementById('d-amount').addEventListener('input', updateAmountWords);
document.getElementById('btn-render-receipt').addEventListener('click', renderReceipt);

// Drucken
document.getElementById('btn-export-all').addEventListener('click', () => window.print());

// Initial
recalcAll();

/* ==========================================================================
   PERSISTENZ — localStorage
   Alle Eingabewerte werden automatisch gespeichert und beim Neuladen
   der Seite wiederhergestellt. Ein "Zurücksetzen"-Button leert alles.
   ========================================================================== */

const STORAGE_KEY = 'stiftung-tax-v2';

function collectState() {
    const state = { fields: {}, checkbox: {}, timestamp: new Date().toISOString() };

    // Alle Number-Inputs und Text-Inputs
    document.querySelectorAll('input[type="number"], input[type="text"], input[type="date"], select').forEach(el => {
        // Eindeutiger Key: data-sphere + data-kind, oder id
        let key;
        if (el.dataset.sphere && el.dataset.kind) {
            key = `sphere:${el.dataset.sphere}:${el.dataset.kind}`;
        } else if (el.id) {
            key = `id:${el.id}`;
        } else {
            return;
        }
        if (el.value !== '') state.fields[key] = el.value;
    });

    // Checkboxen
    document.querySelectorAll('input[type="checkbox"]').forEach(el => {
        if (el.id) state.checkbox[el.id] = el.checked;
    });

    return state;
}

function saveState() {
    try {
        const state = collectState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        updateSaveIndicator();
    } catch (err) {
        console.warn('Speichern fehlgeschlagen:', err);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const state = JSON.parse(raw);

        // Felder
        Object.entries(state.fields || {}).forEach(([key, value]) => {
            let el = null;
            if (key.startsWith('sphere:')) {
                const [, sphere, kind] = key.split(':');
                el = document.querySelector(`[data-sphere="${sphere}"][data-kind="${kind}"]`);
            } else if (key.startsWith('id:')) {
                el = document.getElementById(key.slice(3));
            }
            if (el) el.value = value;
        });

        // Checkboxen
        Object.entries(state.checkbox || {}).forEach(([id, checked]) => {
            const el = document.getElementById(id);
            if (el) el.checked = checked;
        });

        return true;
    } catch (err) {
        console.warn('Laden fehlgeschlagen:', err);
        return false;
    }
}

function clearState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        // Alle Inputs leeren
        document.querySelectorAll('input[type="number"], input[type="text"], input[type="date"]').forEach(el => {
            if (el.id === 'hebesatz') { el.value = '400'; return; } // Hebesatz-Default beibehalten
            el.value = '';
        });
        document.querySelectorAll('input[type="checkbox"]').forEach(el => el.checked = false);
        // Receipt-Vorschau zurücksetzen
        const receipt = document.querySelector('#receipt-preview .receipt__body');
        if (receipt) receipt.innerHTML = '<p class="receipt__placeholder">Formular ausfüllen und „Bestätigung erzeugen" klicken.</p>';
        recalcAll();
        toast('Alle Daten zurückgesetzt', 'ok');
    } catch (err) {
        toast('Zurücksetzen fehlgeschlagen', 'err');
    }
}

/* --- Save-Indikator in der Masthead-Leiste --- */
let saveTimer = null;
function updateSaveIndicator() {
    const ind = document.getElementById('save-indicator');
    if (!ind) return;
    ind.textContent = 'Gespeichert';
    ind.classList.add('save-indicator--active');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        ind.classList.remove('save-indicator--active');
    }, 1500);
}

/* --- Auto-save bei jedem Input --- */
// Debounced: nicht bei jedem Tastendruck, sondern 300ms nach dem letzten
let saveDebounce = null;
function debouncedSave() {
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(saveState, 300);
}

document.addEventListener('input', (e) => {
    if (e.target.matches('input, select, textarea')) debouncedSave();
});
document.addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"], select')) debouncedSave();
});

/* --- Reset-Button wiring --- */
const btnReset = document.getElementById('btn-reset-all');
if (btnReset) {
    btnReset.addEventListener('click', () => {
        if (confirm('Alle gespeicherten Daten wirklich löschen? Dies kann nicht rückgängig gemacht werden.')) {
            clearState();
        }
    });
}

/* --- Initial: gespeicherten Zustand laden und neu berechnen --- */
if (loadState()) {
    recalcAll();
    // Falls Zuwendungsbestätigung ausgefüllt war, auch rendern
    const amountEl = document.getElementById('d-amount');
    if (amountEl && amountEl.value) {
        updateAmountWords();
        renderReceipt();
    }
}

/* ==========================================================================
   CSV-SCHNITTSTELLE
   Format: Semikolon-getrennt, Komma als Dezimaltrennzeichen, UTF-8 mit BOM
   (Deutscher Excel-Standard — sonst werden 1,234.56 zu Datumseinträgen.)
   ========================================================================== */

const CSV = {
    SEP: ';',
    LINE: '\r\n',
    BOM: '\uFEFF'
};

/* ---------- Helpers ---------- */
function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    // Wenn Semikolon, Anführungszeichen oder Zeilenumbruch: in "..." packen
    if (/[";\r\n]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function csvNum(n) {
    // Deutsche Zahlendarstellung: Punkt → Tausendertrenner weglassen, Komma als Dezimal
    if (!Number.isFinite(n)) return '0,00';
    return n.toFixed(2).replace('.', ',');
}

function csvParseNum(s) {
    if (s === null || s === undefined) return 0;
    // Akzeptiere sowohl "1.234,56" als auch "1234.56" als auch "1234,56"
    const cleaned = String(s).trim()
        .replace(/\./g, '')     // Tausenderpunkt raus
        .replace(',', '.');     // Komma → Punkt
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}

function toCSV(rows) {
    return CSV.BOM + rows.map(
        row => row.map(csvEscape).join(CSV.SEP)
    ).join(CSV.LINE);
}

function parseCSV(text) {
    // BOM entfernen, falls vorhanden
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const rows = [];
    let field = '';
    let row = [];
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuotes = false; i++; continue;
            }
            field += ch; i++; continue;
        }

        if (ch === '"') { inQuotes = true; i++; continue; }
        if (ch === CSV.SEP) { row.push(field); field = ''; i++; continue; }
        if (ch === '\r') { i++; continue; }
        if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }

        field += ch; i++;
    }
    // Letztes Feld/Zeile
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

    return rows;
}

function downloadCSV(filename, rows) {
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${filename} heruntergeladen`, 'ok');
}

function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'csv-toast' + (kind ? ` csv-toast--${kind}` : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 2800);
}

function todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ==========================================================================
   EXPORT-SCHEMATA
   ========================================================================== */

function exportSpheres() {
    const spheres = [
        { key: 'ideal', label: 'Ideeller Bereich', rechtsgrundlage: '§ 52 AO' },
        { key: 'asset', label: 'Vermögensverwaltung', rechtsgrundlage: '§ 14 S. 3 AO' },
        { key: 'purpose', label: 'Zweckbetrieb', rechtsgrundlage: '§§ 65–68 AO' },
        { key: 'biz', label: 'Wirtschaftl. Geschäftsbetrieb', rechtsgrundlage: '§ 14 S. 1 AO' }
    ];

    const rows = [
        ['Sphaere', 'Rechtsgrundlage', 'Einnahmen_EUR', 'Ausgaben_EUR', 'Saldo_EUR']
    ];

    spheres.forEach(s => {
        const income = num(document.querySelector(`[data-sphere="${s.key}"][data-kind="in"]`));
        const expense = num(document.querySelector(`[data-sphere="${s.key}"][data-kind="out"]`));
        rows.push([s.label, s.rechtsgrundlage, csvNum(income), csvNum(expense), csvNum(income - expense)]);
    });

    downloadCSV(`sphaerenrechnung_${todayISO()}.csv`, rows);
}

function exportTaxes() {
    const spheres = calcSpheres();
    const profit = Math.max(0, spheres.biz.saldo);
    const grossBiz = spheres.biz.income;
    const kstPflichtig = grossBiz > CONST.FREIGRENZE_GB;
    const kstBase = kstPflichtig ? Math.max(0, profit - CONST.KST_FREIBETRAG) : 0;
    const kst = kstBase * CONST.KST_SATZ;
    const soli = kst * CONST.SOLI_SATZ;
    const hebesatz = num(document.getElementById('hebesatz')) / 100;
    const gewBase = kstPflichtig ? Math.max(0, profit - CONST.GEWST_FREIBETRAG) : 0;
    const messbetrag = gewBase * CONST.GEWST_MESSZAHL;
    const gewst = messbetrag * hebesatz;

    const klein = document.getElementById('kleinunternehmer').checked;
    const ustAsset = klein ? 0 : spheres.asset.income * CONST.UST_ERMAESSIGT;
    const ustPurpose = klein ? 0 : spheres.purpose.income * CONST.UST_ERMAESSIGT;
    const ustBiz = klein ? 0 : spheres.biz.income * CONST.UST_REGEL;
    const ustSum = ustAsset + ustPurpose + ustBiz;

    const rows = [
        ['Position', 'Rechtsgrundlage', 'Basis_EUR', 'Satz', 'Betrag_EUR'],
        ['--- KÖRPERSCHAFTSTEUER ---', '', '', '', ''],
        ['Gewinn wGB', '§ 8 KStG', csvNum(profit), '', csvNum(profit)],
        ['Freibetrag', '§ 24 KStG', '', '', csvNum(kstPflichtig ? CONST.KST_FREIBETRAG : 0)],
        ['Bemessungsgrundlage KSt', '', '', '', csvNum(kstBase)],
        ['Körperschaftsteuer', '§ 23 KStG', csvNum(kstBase), '15,0 %', csvNum(kst)],
        ['Solidaritätszuschlag', 'SolZG', csvNum(kst), '5,5 %', csvNum(soli)],
        ['Summe KSt + Soli', '', '', '', csvNum(kst + soli)],
        ['', '', '', '', ''],
        ['--- GEWERBESTEUER ---', '', '', '', ''],
        ['Gewerbeertrag', '§ 7 GewStG', csvNum(profit), '', csvNum(profit)],
        ['Freibetrag', '§ 11 I GewStG', '', '', csvNum(kstPflichtig ? CONST.GEWST_FREIBETRAG : 0)],
        ['Steuermessbetrag', '§ 11 II GewStG', csvNum(gewBase), '3,5 %', csvNum(messbetrag)],
        ['Hebesatz', '§ 16 GewStG', '', `${(hebesatz * 100).toFixed(0).replace('.', ',')} %`, ''],
        ['Gewerbesteuer', '', csvNum(messbetrag), '', csvNum(gewst)],
        ['', '', '', '', ''],
        ['--- UMSATZSTEUER ---', '', '', '', ''],
        ['Vermögensverwaltung', '§ 12 II UStG', csvNum(spheres.asset.income), '7,0 %', csvNum(ustAsset)],
        ['Zweckbetrieb', '§ 12 II 8a', csvNum(spheres.purpose.income), '7,0 %', csvNum(ustPurpose)],
        ['Wirtschaftl. GB', '§ 12 I UStG', csvNum(spheres.biz.income), '19,0 %', csvNum(ustBiz)],
        ['Summe USt', '', '', '', csvNum(ustSum)],
        ['Kleinunternehmer § 19', '', '', klein ? 'aktiv' : 'inaktiv', ''],
        ['', '', '', '', ''],
        ['--- GESAMT ---', '', '', '', ''],
        ['Steuerlast gesamt', '', '', '', csvNum(kst + soli + gewst + ustSum)],
        ['Effektive Quote (wGB)', '', '', '', profit > 0 ? `${(((kst + soli + gewst) / profit) * 100).toFixed(2).replace('.', ',')} %` : '0,00 %']
    ];

    downloadCSV(`steuerberechnung_${todayISO()}.csv`, rows);
}

function exportReserves() {
    const spheres = calcSpheres();
    const zVorjahr = num(document.getElementById('zufluss-vorjahr'));
    const zLaufend = num(document.getElementById('zufluss-laufend'));
    const verwendet = num(document.getElementById('verwendet'));
    const rFrei = num(document.getElementById('ruecklage-frei'));
    const rZweck = num(document.getElementById('ruecklage-zweck'));
    const rWbr = num(document.getElementById('ruecklage-wbr'));

    const ueberschussVV = Math.max(0, spheres.asset.saldo);
    const sonstige = Math.max(0, spheres.ideal.saldo)
        + Math.max(0, spheres.purpose.saldo)
        + Math.max(0, spheres.biz.saldo);
    const maxFrei = ueberschussVV * CONST.FREIE_RUECKLAGE_VV_QUOTE
        + sonstige * CONST.FREIE_RUECKLAGE_SONST_QUOTE;
    const zSum = zVorjahr + zLaufend;
    const gebunden = verwendet + rFrei + rZweck + rWbr;

    const rows = [
        ['Position', 'Rechtsgrundlage', 'Betrag_EUR', 'Bemerkung'],
        ['--- MITTELZUFLÜSSE ---', '', '', ''],
        ['Zufluss Vorjahr', '', csvNum(zVorjahr), ''],
        ['Zufluss laufendes Jahr', '', csvNum(zLaufend), ''],
        ['Summe zeitnah zu verwenden', '§ 55 I Nr. 5 AO', csvNum(zSum), ''],
        ['', '', '', ''],
        ['--- VERWENDUNG ---', '', '', ''],
        ['Satzungsmäßig verwendet', '§ 55 AO', csvNum(verwendet), ''],
        ['Freie Rücklage', '§ 62 I Nr. 3 AO', csvNum(rFrei),
            rFrei <= maxFrei + 0.01 ? `zulässig (max. ${csvNum(maxFrei)})` : `ÜBERSCHRITTEN um ${csvNum(rFrei - maxFrei)}`],
        ['Zweckgebundene Rücklage', '§ 62 I Nr. 1 AO', csvNum(rZweck), ''],
        ['Wiederbeschaffungsrücklage', '§ 62 I Nr. 2 AO', csvNum(rWbr), ''],
        ['Summe gebunden', '', csvNum(gebunden), ''],
        ['', '', '', ''],
        ['--- PRÜFUNG ---', '', '', ''],
        ['Höchstbetrag freie Rücklage', '1/3 VV + 10% sonst.', csvNum(maxFrei), ''],
        ['Verbleibend (zSum - gebunden)', '', csvNum(zSum - gebunden),
            Math.abs(zSum - gebunden) < 0.01 || (zSum - gebunden) < 0 ? 'zeitnah verwendet' : 'Gemeinnützigkeit gefährdet']
    ];

    downloadCSV(`mittelverwendung_${todayISO()}.csv`, rows);
}

function exportAll() {
    exportSpheres();
    setTimeout(exportTaxes, 300);
    setTimeout(exportReserves, 600);
    setTimeout(() => toast('Alle drei Dateien heruntergeladen', 'ok'), 900);
}

/* ==========================================================================
   IMPORT-PARSER
   ========================================================================== */

function importSpheres(rows) {
    // Erwartetes Format: Header in Zeile 0, dann 4 Datenzeilen
    // Spalten: Sphaere;Rechtsgrundlage;Einnahmen;Ausgaben;Saldo
    const keyMap = {
        'ideeller bereich': 'ideal',
        'ideell': 'ideal',
        'vermögensverwaltung': 'asset',
        'vermoegensverwaltung': 'asset',
        'zweckbetrieb': 'purpose',
        'wirtschaftl. geschäftsbetrieb': 'biz',
        'wirtschaftlicher geschäftsbetrieb': 'biz',
        'wgb': 'biz'
    };

    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 3) continue;
        const label = (row[0] || '').trim().toLowerCase();
        const key = keyMap[label];
        if (!key) continue;

        // Einnahmen und Ausgaben können an Position 1-3 sein (je nach Header)
        // Wir nehmen die letzten beiden Zahlenwerte vor dem Saldo
        const inEl = document.querySelector(`[data-sphere="${key}"][data-kind="in"]`);
        const outEl = document.querySelector(`[data-sphere="${key}"][data-kind="out"]`);

        // Finde numerische Werte in der Zeile
        const nums = row.slice(1).map(csvParseNum).filter(n => n !== 0 || row.slice(1).some(v => String(v).trim() === '0' || String(v).trim() === '0,00'));
        if (nums.length >= 2) {
            // Erste Zahl = Einnahmen, zweite = Ausgaben
            if (inEl) inEl.value = nums[0] || 0;
            if (outEl) outEl.value = nums[1] || 0;
            imported++;
        }
    }

    if (imported > 0) {
        recalcAll();
        toast(`${imported} Sphären importiert`, 'ok');
    } else {
        toast('Keine gültigen Sphären-Daten gefunden', 'err');
    }
}

function importReserves(rows) {
    // Flexibler Parser: sucht nach Schlüsselwörtern in der ersten Spalte
    const patterns = [
        { re: /zufluss.*vorjahr/i, id: 'zufluss-vorjahr' },
        { re: /zufluss.*laufend/i, id: 'zufluss-laufend' },
        { re: /satzungsm.*verwendet|verwendung|verwendet/i, id: 'verwendet' },
        { re: /freie r.cklage/i, id: 'ruecklage-frei' },
        { re: /zweckgeb.*r.cklage/i, id: 'ruecklage-zweck' },
        { re: /wiederbeschaffung/i, id: 'ruecklage-wbr' }
    ];

    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const label = (row[0] || '').trim();
        if (!label || label.startsWith('---') || label.startsWith('Summe')
            || label.startsWith('Höchst') || label.startsWith('Verbleibend')) continue;

        for (const p of patterns) {
            if (p.re.test(label)) {
                // Finde erste numerische Zelle
                for (let j = 1; j < row.length; j++) {
                    const v = csvParseNum(row[j]);
                    if (row[j] && String(row[j]).trim() !== '') {
                        const el = document.getElementById(p.id);
                        if (el) { el.value = v; imported++; }
                        break;
                    }
                }
                break;
            }
        }
    }

    if (imported > 0) {
        recalcAll();
        toast(`${imported} Werte importiert`, 'ok');
    } else {
        toast('Keine gültigen Mittelverwendungs-Daten gefunden', 'err');
    }
}

/* ==========================================================================
   CSV-VORLAGEN
   ========================================================================== */

function templateSpheres() {
    const rows = [
        ['Sphaere', 'Rechtsgrundlage', 'Einnahmen_EUR', 'Ausgaben_EUR', 'Saldo_EUR'],
        ['Ideeller Bereich', '§ 52 AO', '0,00', '0,00', '0,00'],
        ['Vermögensverwaltung', '§ 14 S. 3 AO', '0,00', '0,00', '0,00'],
        ['Zweckbetrieb', '§§ 65-68 AO', '0,00', '0,00', '0,00'],
        ['Wirtschaftl. Geschäftsbetrieb', '§ 14 S. 1 AO', '0,00', '0,00', '0,00']
    ];
    downloadCSV('vorlage_sphaerenrechnung.csv', rows);
}

function templateReserves() {
    const rows = [
        ['Position', 'Rechtsgrundlage', 'Betrag_EUR', 'Bemerkung'],
        ['Zufluss Vorjahr', '', '0,00', ''],
        ['Zufluss laufendes Jahr', '', '0,00', ''],
        ['Satzungsmäßig verwendet', '§ 55 AO', '0,00', ''],
        ['Freie Rücklage', '§ 62 I Nr. 3 AO', '0,00', ''],
        ['Zweckgebundene Rücklage', '§ 62 I Nr. 1 AO', '0,00', ''],
        ['Wiederbeschaffungsrücklage', '§ 62 I Nr. 2 AO', '0,00', '']
    ];
    downloadCSV('vorlage_mittelverwendung.csv', rows);
}

/* ==========================================================================
   FILE-READER
   ========================================================================== */

function readCSVFile(file, handler) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const rows = parseCSV(e.target.result);
            if (rows.length === 0) {
                toast('Datei ist leer', 'err');
                return;
            }
            handler(rows);
        } catch (err) {
            toast('Fehler beim Parsen: ' + err.message, 'err');
        }
    };
    reader.onerror = () => toast('Datei konnte nicht gelesen werden', 'err');
    reader.readAsText(file, 'UTF-8');
}

/* ==========================================================================
   EVENT-WIRING CSV
   ========================================================================== */

// Export-Buttons
document.querySelectorAll('[data-csv-export]').forEach(btn => {
    btn.addEventListener('click', () => {
        const kind = btn.dataset.csvExport;
        if (kind === 'spheres') exportSpheres();
        else if (kind === 'taxes') exportTaxes();
        else if (kind === 'reserves') exportReserves();
        else if (kind === 'all') exportAll();
    });
});

// Vorlage-Buttons
document.querySelectorAll('[data-csv-template]').forEach(btn => {
    btn.addEventListener('click', () => {
        const kind = btn.dataset.csvTemplate;
        if (kind === 'spheres') templateSpheres();
        else if (kind === 'reserves') templateReserves();
    });
});

// Import-Inputs
document.querySelectorAll('[data-csv-import]').forEach(input => {
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const kind = input.dataset.csvImport;
        readCSVFile(file, (rows) => {
            if (kind === 'spheres') importSpheres(rows);
            else if (kind === 'reserves') importReserves(rows);
        });
        // Input zurücksetzen, damit dieselbe Datei erneut geladen werden kann
        input.value = '';
    });
});