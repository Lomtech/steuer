/* ==========================================================================
   Stiftungssteuer — Berechnungslogik
   VZ 2025 · Stand: geltendes Recht
   ========================================================================== */

/* ---------- Konstanten (jährlich prüfen) ---------- */
const CONST = {
    FREIGRENZE_GB: 45000,        // § 64 Abs. 3 AO
    KST_FREIBETRAG: 5000,        // § 24 KStG
    GEWST_FREIBETRAG: 5000,      // § 11 GewStG
    KST_SATZ: 0.15,              // § 23 KStG
    SOLI_SATZ: 0.055,            // SolZG
    GEWST_MESSZAHL: 0.035,       // § 11 II GewStG
    UST_ERMAESSIGT: 0.07,        // § 12 II UStG
    UST_REGEL: 0.19,             // § 12 I UStG
    KLEIN_VORJAHR: 22000,        // § 19 I UStG
    KLEIN_LAUFEND: 50000,        // § 19 I UStG
    FREIE_RUECKLAGE_VV_QUOTE: 1 / 3,   // § 62 I Nr. 3 AO, 1/3 aus Vermögensverwaltung
    FREIE_RUECKLAGE_SONST_QUOTE: 0.10 // 10 % der sonstigen zeitnah zu verwendenden Mittel
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
        freigrenzeText.innerHTML = `Bruttoeinnahmen aus wGB: <strong data-freigrenze-value>${fmtEUR.format(grossBiz)}</strong> — Schwellenwert 45.000 €. Bitte Einnahmen erfassen.`;
    } else if (grossBiz <= CONST.FREIGRENZE_GB) {
        freigrenzeBox.classList.add('is-ok');
        freigrenzeText.innerHTML = `Bruttoeinnahmen wGB: <strong>${fmtEUR.format(grossBiz)}</strong> — <strong>unterhalb</strong> der Freigrenze von 45.000 €. Keine KSt/GewSt auf den wGB.`;
    } else {
        freigrenzeBox.classList.add('is-warn');
        freigrenzeText.innerHTML = `Bruttoeinnahmen wGB: <strong>${fmtEUR.format(grossBiz)}</strong> — <strong>oberhalb</strong> 45.000 €. wGB wird voll steuerpflichtig.`;
    }

    return results;
}

/* ==========================================================================
   MODUL 02 · STEUERN
   ========================================================================== */
function calcTaxes(spheres) {
    /* --- KSt --- */
    const profitBiz = Math.max(0, spheres.biz.saldo);
    const grossBiz = spheres.biz.income;

    // Über Freigrenze? Dann voll steuerpflichtig
    const kstPflichtig = grossBiz > CONST.FREIGRENZE_GB;

    const kstBase = kstPflichtig ? Math.max(0, profitBiz - CONST.KST_FREIBETRAG) : 0;
    const kst = kstBase * CONST.KST_SATZ;
    const soli = kst * CONST.SOLI_SATZ;
    const kstTotal = kst + soli;

    setOut('profit', fmtEUR.format(profitBiz));
    setOut('kst-freibetrag', kstPflichtig ? fmtEUR.format(CONST.KST_FREIBETRAG) : fmtEUR.format(0));
    setOut('kst-base', fmtEUR.format(kstBase));
    setOut('kst', fmtEUR.format(kst));
    setOut('soli', fmtEUR.format(soli));
    setOut('kst-total', fmtEUR.format(kstTotal));

    /* --- GewSt --- */
    const hebesatz = num(document.getElementById('hebesatz')) / 100;
    const gewBase = kstPflichtig ? Math.max(0, profitBiz - CONST.GEWST_FREIBETRAG) : 0;
    const messbetrag = gewBase * CONST.GEWST_MESSZAHL;
    const gewst = messbetrag * hebesatz;

    setOut('gew-profit', fmtEUR.format(profitBiz));
    setOut('gew-base', fmtEUR.format(gewBase));
    setOut('gew-messbetrag', fmtEUR.format(messbetrag));
    setOut('gew-total', fmtEUR.format(gewst));

    /* --- USt --- */
    const klein = document.getElementById('kleinunternehmer').checked;

    const ustBlocks = {
        asset: { net: spheres.asset.income, rate: CONST.UST_ERMAESSIGT },
        purpose: { net: spheres.purpose.income, rate: CONST.UST_ERMAESSIGT },
        biz: { net: spheres.biz.income, rate: CONST.UST_REGEL }
    };

    let totalNet = 0, totalTax = 0, totalGross = 0;

    Object.entries(ustBlocks).forEach(([key, b]) => {
        const tax = klein ? 0 : b.net * b.rate;
        const gross = b.net + tax;
        setOut(`${key}-net`, fmtEUR.format(b.net), 'ust');
        setOut(`${key}-tax`, fmtEUR.format(tax), 'ust');
        setOut(`${key}-gross`, fmtEUR.format(gross), 'ust');
        totalNet += b.net; totalTax += tax; totalGross += gross;
    });

    setOut('total-net', fmtEUR.format(totalNet), 'ust');
    setOut('total-tax', fmtEUR.format(totalTax), 'ust');
    setOut('total-gross', fmtEUR.format(totalGross), 'ust');

    /* Kleinunternehmer-Hinweis dynamisch */
    const hint = document.getElementById('kleinunternehmer-hint');
    const gesamtumsatz = spheres.asset.income + spheres.purpose.income + spheres.biz.income;
    if (gesamtumsatz > CONST.KLEIN_LAUFEND) {
        hint.innerHTML = `<strong style="color:var(--coral)">Gesamtumsatz ${fmtEUR.format(gesamtumsatz)}</strong> überschreitet 50.000 € — Kleinunternehmerregelung nicht anwendbar.`;
    } else if (gesamtumsatz > CONST.KLEIN_VORJAHR) {
        hint.innerHTML = `<strong style="color:var(--ochre)">Gesamtumsatz ${fmtEUR.format(gesamtumsatz)}</strong> überschreitet 22.000 € — Prüfung Vorjahr/laufend erforderlich.`;
    } else {
        hint.innerHTML = `Prüfung gegen 22.000 € (Vorjahr) / 50.000 € (laufend). Bei Aktivierung keine USt-Erhebung.`;
    }

    /* --- Summary --- */
    const grandTotal = kstTotal + gewst + totalTax;
    setOut('grand-total', fmtEUR.format(grandTotal));

    const effRate = profitBiz > 0 ? (kstTotal + gewst) / profitBiz : 0;
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

    verwDetail.innerHTML = `Zugeflossen: <strong>${fmtEUR.format(zSum)}</strong> · Verwendet/Rücklage: <strong>${fmtEUR.format(gebunden)}</strong> · Verbleibend: <strong>${fmtEUR.format(verbleibend)}</strong>`;

    if (zSum === 0) {
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