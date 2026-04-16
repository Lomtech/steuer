const fmt = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
});

/* ================= SERVICES ================= */

const servicesDiv = document.getElementById("services");

document.getElementById("add-service").onclick = () => {
    const div = document.createElement("div");
    div.className = "service";

    div.innerHTML = `
    <input type="number" placeholder="Betrag" class="amount"/>
    <select class="vat">
      <option value="0">steuerfrei</option>
      <option value="0.07">7%</option>
      <option value="0.19">19%</option>
    </select>
    <button onclick="this.parentElement.remove()">X</button>
  `;

    servicesDiv.appendChild(div);
};

/* ================= CORE LOGIC ================= */

function getSpheres() {
    const val = id => parseFloat(document.getElementById(id).value) || 0;

    return {
        ideal: val("ideal-in") - val("ideal-out"),
        asset: val("asset-in") - val("asset-out"),
        purpose: val("purpose-in") - val("purpose-out"),
        biz: val("biz-in") - val("biz-out"),
        bizRevenue: val("biz-in")
    };
}

/* ===== Umsatzsteuer ===== */

function calcVAT() {
    const klein = document.getElementById("klein").checked;

    let net = 0;
    let vat = 0;

    document.querySelectorAll(".service").forEach(s => {
        const amount = parseFloat(s.querySelector(".amount").value) || 0;
        const rate = klein ? 0 : parseFloat(s.querySelector(".vat").value);

        net += amount;
        vat += amount * rate;
    });

    return { net, vat };
}

/* ===== Kleinunternehmer ===== */

function checkKlein() {
    const prev = parseFloat(document.getElementById("prev-year").value) || 0;
    const current = calcVAT().net;

    return prev <= 25000 && current <= 100000;
}

/* ===== KSt ===== */

function calcKSt(profit, taxable) {
    if (!taxable) return 0;

    const base = Math.max(0, profit - 5000);
    const tax = base * 0.15;
    const soli = tax * 0.055;

    return tax + soli;
}

/* ===== GewSt ===== */

function calcGewSt(profit, hebesatz, taxable) {
    if (!taxable) return 0;

    const rounded = Math.floor(profit / 100) * 100;
    const base = Math.max(0, rounded - 5000);

    const messbetrag = base * 0.035;
    return messbetrag * (hebesatz / 100);
}

/* ================= MAIN ================= */

document.getElementById("calc").onclick = () => {

    const s = getSpheres();
    const hebesatz = parseFloat(document.getElementById("hebesatz").value) || 400;

    /* wGB Freigrenze */
    const wgbTaxable = s.bizRevenue > 50000;

    /* KSt / GewSt */
    const kst = calcKSt(s.biz, wgbTaxable);
    const gewst = calcGewSt(s.biz, hebesatz, wgbTaxable);

    /* USt */
    const vat = calcVAT();

    const total = kst + gewst + vat.vat;

    document.getElementById("kst").textContent = fmt.format(kst);
    document.getElementById("gewst").textContent = fmt.format(gewst);
    document.getElementById("ust").textContent = fmt.format(vat.vat);
    document.getElementById("total").textContent = fmt.format(total);
};