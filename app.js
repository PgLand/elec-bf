// ElectroGest BF — gestion commerciale (HTML/CSS/JS, offline localStorage)
const KEY = 'electrogest_bf_v1';
let state = { produits: [], ventes: [], clients: [] };
let editingProduitId = null;
let editingClientId = null;
let editingVenteId = null;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => (Number(n) || 0).toLocaleString('fr-FR') + ' FCFA';
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
const todayISO = () => new Date().toISOString().slice(0, 10);

function load() {
  try { const r = localStorage.getItem(KEY); if (r) state = JSON.parse(r); } catch(e){}
  state.produits ||= []; state.ventes ||= []; state.clients ||= [];
  state.produits.forEach(p => {
    if (p.prixVentePrevu == null && p.prixVente != null) p.prixVentePrevu = p.prixVente;
    delete p.prixVente;
  });
  state.ventes.forEach(v => {
    if (v.benefice == null) {
      const p = state.produits.find(x => x.id === v.produitId);
      const cout = (p ? p.prixAchat : 0) * (v.quantite || 0);
      v.benefice = (v.total || 0) - cout;
    }
    if (v.prixVente == null && v.quantite) {
      v.prixVente = ((v.total || 0) + (v.remise || 0)) / v.quantite;
    }
  });
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

// Tabs
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.view').forEach(v => v.classList.remove('active'));
  t.classList.add('active');
  $('#' + t.dataset.tab).classList.add('active');
}));

// --- Stock
function syncStockPrix(source) {
  const unit = $('#stockPrixUnitaire');
  const total = $('#stockPrixTotal');
  const qte = +$('#stockQuantite').value || 0;
  if (!qte) return;
  if (source === 'unit') total.value = Math.round(+unit.value || 0) * qte || '';
  else if (source === 'total') unit.value = Math.round((+total.value || 0) / qte) || '';
  else if (source === 'qte') {
    if (+unit.value) total.value = Math.round(+unit.value * qte);
    else if (+total.value) unit.value = Math.round(+total.value / qte);
  }
}

$('#stockPrixUnitaire').addEventListener('input', () => syncStockPrix('unit'));
$('#stockPrixTotal').addEventListener('input', () => syncStockPrix('total'));
$('#stockQuantite').addEventListener('input', () => syncStockPrix('qte'));

function resetFormProduit() {
  editingProduitId = null;
  $('#formProduit').reset();
  $('#stockDateAchat').value = todayISO();
  $('#formProduitTitle').textContent = '➕ Ajouter un produit';
  $('#btnProduitSubmit').textContent = 'Ajouter au stock';
  $('#btnProduitCancel').hidden = true;
}

function startEditProduit(p) {
  editingProduitId = p.id;
  const f = $('#formProduit');
  f.nom.value = p.nom;
  f.categorie.value = p.categorie;
  f.marque.value = p.marque || '';
  f.dateAchat.value = p.dateAchat || todayISO();
  f.prixVentePrevu.value = p.prixVentePrevu || '';
  f.prixAchatUnitaire.value = p.prixAchat;
  f.quantite.value = p.quantite;
  f.prixAchatTotal.value = p.prixAchat * p.quantite;
  $('#formProduitTitle').textContent = '✏️ Modifier le produit';
  $('#btnProduitSubmit').textContent = 'Enregistrer les modifications';
  $('#btnProduitCancel').hidden = false;
  document.querySelector('[data-tab="stock"]').click();
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#btnProduitCancel').addEventListener('click', resetFormProduit);

$('#formProduit').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const quantite = +f.get('quantite');
  const prixAchat = +f.get('prixAchatUnitaire');
  const prixAchatTotal = +f.get('prixAchatTotal');
  const prixVentePrevu = +f.get('prixVentePrevu');
  const dateAchat = f.get('dateAchat');
  if (!dateAchat) return alert('Indiquez la date d\'achat');
  if (!quantite || quantite <= 0) return alert('Indiquez une quantité valide');
  if (!prixAchat || prixAchat <= 0) return alert('Indiquez un prix d\'achat unitaire');
  if (!prixVentePrevu || prixVentePrevu <= 0) return alert('Indiquez un prix de vente prévu');
  const totalAttendu = prixAchat * quantite;
  if (Math.abs(prixAchatTotal - totalAttendu) > 1) {
    return alert(`Incohérence : ${quantite} × ${fmt(prixAchat)} = ${fmt(totalAttendu)}, pas ${fmt(prixAchatTotal)}`);
  }
  const data = {
    nom: f.get('nom').trim(),
    categorie: f.get('categorie'),
    marque: f.get('marque').trim(),
    dateAchat,
    prixVentePrevu,
    prixAchat,
    quantite,
  };
  if (editingProduitId) {
    const p = state.produits.find(x => x.id === editingProduitId);
    if (!p) return alert('Produit introuvable');
    Object.assign(p, data);
  } else {
    state.produits.push({ id: uid(), ...data });
  }
  save(); resetFormProduit(); renderAll();
});

function renderStock() {
  const q = ($('#searchStock').value || '').toLowerCase();
  const tb = $('#tbodyStock'); tb.innerHTML = '';
  state.produits
    .filter(p => !q || (p.nom+p.categorie+p.marque+(p.dateAchat||'')).toLowerCase().includes(q))
    .forEach(p => {
      const stockPill = p.quantite === 0 ? '<span class="pill low">Rupture</span>'
        : p.quantite <= 3 ? '<span class="pill warn">'+p.quantite+'</span>'
        : '<span class="pill ok">'+p.quantite+'</span>';
      tb.insertAdjacentHTML('beforeend', `<tr>
        <td><strong>${p.nom}</strong></td>
        <td>${p.dateAchat ? fmtDate(p.dateAchat) : '—'}</td>
        <td>${p.categorie}</td>
        <td>${p.marque||'—'}</td>
        <td>${fmt(p.prixVentePrevu || 0)}</td>
        <td>${fmt(p.prixAchat)}</td>
        <td>${fmt(p.prixAchat * p.quantite)}</td>
        <td>${stockPill}</td>
        <td class="actions">
          <button class="btn small" data-edit-p="${p.id}" title="Modifier">✏️</button>
          <button class="btn small danger" data-del-p="${p.id}" title="Supprimer">×</button>
        </td>
      </tr>`);
    });
  tb.querySelectorAll('[data-edit-p]').forEach(b => b.onclick = () => {
    const p = state.produits.find(x => x.id === b.dataset.editP);
    if (p) startEditProduit(p);
  });
  tb.querySelectorAll('[data-del-p]').forEach(b => b.onclick = () => {
    if (confirm('Supprimer ce produit ?')) {
      if (b.dataset.delP === editingProduitId) resetFormProduit();
      state.produits = state.produits.filter(p => p.id !== b.dataset.delP);
      save(); renderAll();
    }
  });
}
$('#searchStock').addEventListener('input', renderStock);

// --- Clients
function resetFormClient() {
  editingClientId = null;
  $('#formClient').reset();
  $('#formClientTitle').textContent = '➕ Ajouter un client';
  $('#btnClientSubmit').textContent = 'Ajouter';
  $('#btnClientCancel').hidden = true;
}

function setSelectValue(select, value) {
  if (!select) return;
  if (!value) { select.value = ''; return; }
  const exists = [...select.options].some(o => o.value === value || o.textContent === value);
  if (!exists) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = value;
    select.appendChild(o);
  }
  select.value = value;
}

function startEditClient(c) {
  editingClientId = c.id;
  const f = $('#formClient');
  f.nom.value = c.nom;
  f.telephone.value = c.telephone || '';
  setSelectValue(f.ville, c.ville || '');
  setSelectValue(f.type, c.type || 'Particulier');
  $('#formClientTitle').textContent = '✏️ Modifier le client';
  $('#btnClientSubmit').textContent = 'Enregistrer les modifications';
  $('#btnClientCancel').hidden = false;
  document.querySelector('[data-tab="clients"]').click();
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#btnClientCancel').addEventListener('click', resetFormClient);

$('#formClient').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const data = {
    nom: f.get('nom').trim(),
    telephone: f.get('telephone').trim(),
    ville: f.get('ville'),
    type: f.get('type'),
  };
  if (!data.ville) return alert('Veuillez choisir une ville');
  if (!data.type) return alert('Veuillez choisir un type de client');
  if (editingClientId) {
    const c = state.clients.find(x => x.id === editingClientId);
    if (!c) return alert('Client introuvable');
    Object.assign(c, data);
  } else {
    state.clients.push({ id: uid(), ...data });
  }
  save(); resetFormClient(); renderAll();
});

function renderClients() {
  const q = ($('#searchClients').value || '').toLowerCase();
  const tb = $('#tbodyClients'); tb.innerHTML = '';
  state.clients
    .filter(c => !q || (c.nom+c.telephone+c.ville).toLowerCase().includes(q))
    .forEach(c => {
      const achats = state.ventes.filter(v => v.clientId === c.id)
        .reduce((s,v) => s + v.total, 0);
      tb.insertAdjacentHTML('beforeend', `<tr>
        <td><strong>${c.nom}</strong></td>
        <td>${c.telephone||'—'}</td>
        <td>${c.ville||'—'}</td>
        <td>${c.type}</td>
        <td>${fmt(achats)}</td>
        <td class="actions">
          <button class="btn small" data-edit-c="${c.id}" title="Modifier">✏️</button>
          <button class="btn small danger" data-del-c="${c.id}" title="Supprimer">×</button>
        </td>
      </tr>`);
    });
  tb.querySelectorAll('[data-edit-c]').forEach(b => b.onclick = () => {
    const c = state.clients.find(x => x.id === b.dataset.editC);
    if (c) startEditClient(c);
  });
  tb.querySelectorAll('[data-del-c]').forEach(b => b.onclick = () => {
    if (confirm('Supprimer ce client ?')) {
      if (b.dataset.delC === editingClientId) resetFormClient();
      state.clients = state.clients.filter(c => c.id !== b.dataset.delC);
      save(); renderAll();
    }
  });
}
$('#searchClients').addEventListener('input', renderClients);

// --- Ventes
function stockDispoPourVente(produitId, venteEnCoursId = null) {
  const p = state.produits.find(x => x.id === produitId);
  if (!p) return 0;
  let dispo = p.quantite;
  if (venteEnCoursId) {
    const v = state.ventes.find(x => x.id === venteEnCoursId);
    if (v && v.produitId === produitId) dispo += v.quantite;
  }
  return dispo;
}

function resetFormVente() {
  editingVenteId = null;
  $('#formVente').reset();
  $('#formVente').quantite.value = 1;
  $('#formVenteTitle').textContent = '🧾 Nouvelle vente';
  $('#btnVenteSubmit').textContent = 'Enregistrer la vente';
  $('#btnVenteCancel').hidden = true;
  updateVentePreview();
}

function fillVenteForm(v) {
  const f = $('#formVente');
  f.clientId.value = v.clientId || '';
  f.produitId.value = v.produitId || '';
  f.prixVente.value = v.prixVente || '';
  f.quantite.value = v.quantite || 1;
  f.remise.value = v.remise || 0;
  f.paiement.value = v.paiement || 'Espèces';
}

function startEditVente(v) {
  editingVenteId = v.id;
  fillVenteForm(v);
  $('#formVenteTitle').textContent = '✏️ Modifier la vente';
  $('#btnVenteSubmit').textContent = 'Enregistrer les modifications';
  $('#btnVenteCancel').hidden = false;
  document.querySelector('[data-tab="commandes"]').click();
  updateVentePreview();
  $('#formVente').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function buildVenteFromForm(f, produit) {
  const qte = +f.get('quantite');
  const prixVente = +f.get('prixVente');
  const remise = +f.get('remise') || 0;
  const sousTotal = prixVente * qte;
  const remiseAppliquee = Math.min(remise, sousTotal);
  const total = sousTotal - remiseAppliquee;
  const benefice = total - produit.prixAchat * qte;
  return {
    produitId: produit.id,
    produitNom: produit.nom,
    quantite: qte,
    clientId: f.get('clientId'),
    prixVente,
    sousTotal,
    paiement: f.get('paiement'),
    remise: remiseAppliquee,
    total,
    benefice,
  };
}

function updateVentePreview() {
  const f = $('#formVente');
  const produit = state.produits.find(p => p.id === f.produitId.value);
  const prixVente = +f.prixVente.value || 0;
  const qte = +f.quantite.value || 0;
  const remise = +f.remise.value || 0;
  const sousTotalEl = $('#venteSousTotal');
  const remiseEl = $('#venteRemiseAff');
  const totalEl = $('#venteTotal');
  const beneficeEl = $('#venteBenefice');

  if (!produit || !prixVente || !qte) {
    sousTotalEl.textContent = '—';
    remiseEl.textContent = '—';
    totalEl.textContent = '—';
    beneficeEl.textContent = '—';
    beneficeEl.style.color = '';
    return;
  }

  const sousTotal = prixVente * qte;
  const remiseAppliquee = Math.min(remise, sousTotal);
  const total = sousTotal - remiseAppliquee;
  const coutAchat = produit.prixAchat * qte;
  const benefice = total - coutAchat;

  sousTotalEl.textContent = fmt(sousTotal);
  remiseEl.textContent = remiseAppliquee > 0 ? '− ' + fmt(remiseAppliquee) : fmt(0);
  remiseEl.style.color = remiseAppliquee > 0 ? 'var(--danger)' : '';
  totalEl.textContent = fmt(total);
  beneficeEl.textContent = fmt(benefice);
  beneficeEl.style.color = benefice >= 0 ? 'var(--success)' : 'var(--danger)';
}

$('#formVente').addEventListener('input', updateVentePreview);
$('#formVente').addEventListener('change', e => {
  if (e.target.name === 'produitId' && !editingVenteId) {
    const produit = state.produits.find(p => p.id === e.target.value);
    if (produit?.prixVentePrevu) $('#ventePrixVente').value = produit.prixVentePrevu;
  }
  updateVentePreview();
});

$('#btnVenteCancel').addEventListener('click', resetFormVente);

$('#formVente').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const clientId = f.get('clientId');
  if (!clientId) return alert('Veuillez choisir un client');
  const produit = state.produits.find(p => p.id === f.get('produitId'));
  if (!produit) return alert('Produit introuvable');
  const qte = +f.get('quantite');
  const prixVente = +f.get('prixVente');
  if (!prixVente || prixVente <= 0) return alert('Indiquez le prix de vente');
  const remise = +f.get('remise') || 0;
  const sousTotal = prixVente * qte;
  if (remise > sousTotal) return alert('La remise ne peut pas dépasser le sous-total (' + fmt(sousTotal) + ')');

  const dispo = stockDispoPourVente(produit.id, editingVenteId);
  if (qte > dispo) return alert('Stock insuffisant (disponible: '+dispo+')');

  const venteData = buildVenteFromForm(f, produit);

  if (editingVenteId) {
    const old = state.ventes.find(x => x.id === editingVenteId);
    if (!old) return alert('Vente introuvable');
    const oldProd = state.produits.find(p => p.id === old.produitId);
    if (oldProd) oldProd.quantite += old.quantite;
    produit.quantite -= venteData.quantite;
    Object.assign(old, venteData);
  } else {
    state.ventes.push({
      id: uid(),
      date: new Date().toISOString(),
      ...venteData,
    });
    produit.quantite -= qte;
  }

  save(); resetFormVente(); renderAll();
});

function renderVentes() {
  const selP = $('#venteProduit');
  selP.innerHTML = '<option value="">— Produit —</option>' +
    state.produits.filter(p => p.quantite > 0 || (editingVenteId && state.ventes.find(v => v.id === editingVenteId)?.produitId === p.id))
      .map(p => `<option value="${p.id}">${p.nom} — vente prévu ${fmt(p.prixVentePrevu || 0)} (stock: ${p.quantite})</option>`).join('');
  const selC = $('#venteClient');
  selC.innerHTML = '<option value="">— Choisir un client —</option>' +
    state.clients.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');

  if (editingVenteId) {
    const v = state.ventes.find(x => x.id === editingVenteId);
    if (v) fillVenteForm(v);
  }

  const q = ($('#searchVentes').value || '').toLowerCase();
  const tb = $('#tbodyVentes'); tb.innerHTML = '';
  [...state.ventes].reverse()
    .filter(v => !q || (v.produitNom+v.paiement).toLowerCase().includes(q))
    .forEach(v => {
      const client = state.clients.find(c => c.id === v.clientId);
      const benefice = v.benefice ?? 0;
      const remise = v.remise ?? 0;
      tb.insertAdjacentHTML('beforeend', `<tr>
        <td>${fmtDate(v.date)}</td>
        <td>${v.produitNom}</td>
        <td>${v.quantite}</td>
        <td>${client ? client.nom : '—'}</td>
        <td>${fmt(v.prixVente || 0)}</td>
        <td>${remise > 0 ? '− ' + fmt(remise) : '—'}</td>
        <td>${v.paiement}</td>
        <td><strong>${fmt(v.total)}</strong></td>
        <td style="color:${benefice>=0?'var(--success)':'var(--danger)'}"><strong>${fmt(benefice)}</strong></td>
        <td class="actions">
          <button class="btn small" data-edit-v="${v.id}" title="Modifier">✏️</button>
          <button class="btn small danger" data-del-v="${v.id}" title="Supprimer">×</button>
        </td>
      </tr>`);
    });
  tb.querySelectorAll('[data-edit-v]').forEach(b => b.onclick = () => {
    const v = state.ventes.find(x => x.id === b.dataset.editV);
    if (v) startEditVente(v);
  });
  tb.querySelectorAll('[data-del-v]').forEach(b => b.onclick = () => {
    if (confirm('Annuler cette vente ? Le stock sera restitué.')) {
      if (b.dataset.delV === editingVenteId) resetFormVente();
      const v = state.ventes.find(x => x.id === b.dataset.delV);
      const p = state.produits.find(p => p.id === v.produitId);
      if (p) p.quantite += v.quantite;
      state.ventes = state.ventes.filter(x => x.id !== b.dataset.delV);
      save(); renderAll();
    }
  });
}
$('#searchVentes').addEventListener('input', renderVentes);

// --- Dashboard
function renderDashboard() {
  const totalProduits = state.produits.reduce((s,p) => s + p.quantite, 0);
  const valeur = state.produits.reduce((s,p) => s + p.prixAchat * p.quantite, 0);
  const now = new Date();
  const ventesDuMois = state.ventes
    .filter(v => { const d = new Date(v.date); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); });
  const ventesMois = ventesDuMois.reduce((s,v) => s + v.total, 0);
  const beneficeMois = ventesDuMois.reduce((s,v) => s + (v.benefice ?? 0), 0);
  $('#kpiProduits').textContent = totalProduits;
  $('#kpiValeur').textContent = fmt(valeur);
  $('#kpiVentes').textContent = fmt(ventesMois);
  $('#kpiBenefice').textContent = fmt(beneficeMois);
  $('#kpiBenefice').style.color = beneficeMois >= 0 ? 'var(--success)' : 'var(--danger)';
  $('#kpiClients').textContent = state.clients.length;

  const greet = $('#dashboardGreeting');
  if (greet) {
    const h = now.getHours();
    greet.textContent = (h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir') + ' 👋';
  }

  const low = state.produits.filter(p => p.quantite <= 3);
  $('#lowStockList').innerHTML = low.length
    ? low.map(p => `<li><span>${p.nom}</span><span class="pill ${p.quantite===0?'low':'warn'}">${p.quantite}</span></li>`).join('')
    : '<li class="muted">Tous les stocks sont OK ✅</li>';

  const last = [...state.ventes].reverse().slice(0,5);
  $('#lastSalesList').innerHTML = last.length
    ? last.map(v => {
        const remiseTxt = (v.remise ?? 0) > 0 ? ` <em class="muted">(remise −${fmt(v.remise)})</em>` : '';
        return `<li><span>${v.produitNom} ×${v.quantite}${remiseTxt}</span><span><strong>${fmt(v.total)}</strong> <em class="benefice-inline" style="color:${(v.benefice??0)>=0?'var(--success)':'var(--danger)'}">${(v.benefice??0)>=0?'+':''}${fmt(v.benefice??0)}</em></span></li>`;
      }).join('')
    : '<li class="muted">Aucune vente enregistrée</li>';
}

// --- Paramètres
$('#btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'electrogest-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
};
$('#fileImport').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try { state = JSON.parse(r.result); save(); renderAll(); alert('Importé ✅'); }
    catch { alert('Fichier invalide'); }
  };
  r.readAsText(file);
};
$('#btnReset').onclick = () => {
  if (confirm('Effacer TOUTES les données ?')) {
    state = { produits: [], ventes: [], clients: [] };
    save(); renderAll();
  }
};

function renderAll() { renderStock(); renderClients(); renderVentes(); renderDashboard(); }

$('#dateNow').textContent = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

WariLicense.whenReady(() => {
  load();
  renderAll();
  $('#stockDateAchat').value = todayISO();
});
