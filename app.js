// ============================================================
// MA STATION — SUIVI DE SERVICE — APP.JS (version corrigée et fusionnée)
// ============================================================

// ⚠️ REMPLACE PAR TES VALEURS SUPABASE
const SUPABASE_URL = 'https://golrvqweqcudptwdzufk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tmdtvlF6Mcd5vPQWiJeMdQ_eeee0-J1';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// VARIABLES GLOBALES
// ============================================================

let currentUser = null;

let profileInfo = { id:'', full_name:'', phone:'', email:'', station_name:'', role:'' };

let stationOptions = [];

let pompisteState = defaultPompisteState();

let currentEditVersementId = null;
let currentEditDepenseId = null;

let historyCache = [];

let authMode = 'login'; // 'login' | 'signup'

// ============================================================
// UTILITAIRES
// ============================================================

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).substring(2,9);
}

function num(v){
  if(v === null || v === undefined || v === '') return 0;
  if(typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const clean = String(v).replace(/\s/g,'').replace(',', '.').replace(/[^\d.-]/g,'');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v){
  return Math.round(num(v)).toLocaleString('fr-FR');
}

function todayDate(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

// ============================================================
// TYPES DE VERSEMENT
// ============================================================

const VTYPES = [
  { key:'cash', label:'Espèces', ic:'💵' },
  { key:'orange', label:'Orange Money', ic:'🟠' },
  { key:'mtn', label:'MTN Mobile Money', ic:'🟡' },
  { key:'tomcard', label:'Tom Card', ic:'💳' },
  { key:'voucher', label:'Bon / Voucher', ic:'🎟️' },
  { key:'bank', label:'Versement bancaire', ic:'🏦' }
];

// ============================================================
// CONFIGURATION DE STATION (prix + catalogue boutique)
// Partagée par toute la station — définie uniquement par le superviseur.
// Chargée depuis Supabase, jamais éditée directement par pompiste/hôtesse.
// ============================================================

let stationConfig = null;

const GAS_TYPES = ['6kg', '12.5kg', '35kg'];

function gasTypeLabel(type){
  return {
    '6kg': 'Gaz 6 kg (Éco-gaz)',
    '12.5kg': 'Gaz 12,5 kg (Grande bouteille)',
    '35kg': 'Gaz 35 kg (Très grande bouteille)'
  }[type] || type;
}

function defaultStationConfig(){
  return {
    fuel_prices: { super:0, gazole:0, petrole:0 },
    gas_prices: {
      '6kg': { recharge:0, bouteilleVide:0 },
      '12.5kg': { recharge:0, bouteilleVide:0 },
      '35kg': { recharge:0, bouteilleVide:0 }
    },
    boutique_products: []
  };
}

async function loadStationConfig(stationName){
  if(!stationName){
    stationConfig = defaultStationConfig();
    return;
  }

  try{
    const { data, error } = await sb.from('station_config').select('*').eq('station_name', stationName).maybeSingle();
    if(error) throw error;

    const def = defaultStationConfig();

    stationConfig = data ? {
      fuel_prices: { ...def.fuel_prices, ...(data.fuel_prices || {}) },
      gas_prices: {
        '6kg': { ...def.gas_prices['6kg'], ...((data.gas_prices || {})['6kg'] || {}) },
        '12.5kg': { ...def.gas_prices['12.5kg'], ...((data.gas_prices || {})['12.5kg'] || {}) },
        '35kg': { ...def.gas_prices['35kg'], ...((data.gas_prices || {})['35kg'] || {}) }
      },
      boutique_products: Array.isArray(data.boutique_products) ? data.boutique_products : []
    } : def;
  }catch(e){
    console.warn('Config station indisponible :', e.message);
    stationConfig = defaultStationConfig();
  }
}

async function persistStationConfig(stationName){
  const station = stationName || profileInfo.station_name;
  if(!station || !stationConfig) return false;

  try{
    const { error } = await sb.from('station_config').upsert({
      station_name: station,
      fuel_prices: stationConfig.fuel_prices,
      gas_prices: stationConfig.gas_prices,
      boutique_products: stationConfig.boutique_products,
      updated_at: new Date().toISOString()
    }, { onConflict: 'station_name' });

    if(error) throw error;
    return true;
  }catch(e){
    console.warn('Sauvegarde config station impossible :', e.message);
    return false;
  }
}

// ============================================================
// ÉTAT PAR DÉFAUT DU POMPISTE
// ============================================================

function defaultPompisteState(){
  return {
    status: 'none',
    openedAt: null,
    closedAt: null,
    stationName: '',
    pompisteName: '',
    posteNumber: '',
    ilotNumber: '',
    signature: '',
    // Liste dynamique : une station peut avoir plusieurs pistolets par carburant
    // (ex. 2 Super + 2 Gazole + 1 Pétrole). Chaque pompe est une entrée indépendante.
    // Les prix ne sont plus stockés ici : ils viennent de stationConfig (fixés par le superviseur).
    fuels: [
      { id: uid(), type:'super',   opening:'', closing:'' },
      { id: uid(), type:'gazole',  opening:'', closing:'' },
      { id: uid(), type:'petrole', opening:'', closing:'' }
    ],
    gaz: {
      '6kg':    { opening:0, recharge:0, consigne:0 },
      '12.5kg': { opening:0, recharge:0, consigne:0 },
      '35kg':   { opening:0, recharge:0, consigne:0 }
    },
    versements: [],
    depenses: [],
    clientCredits: [],
    notes: ''
  };
}

// ============================================================
// CALCULS
// ============================================================

// Libellé humain d'un type de carburant
function fuelTypeLabel(type){
  return { super:'Super', gazole:'Gazole', petrole:'Pétrole' }[type] || type;
}

// Accepte l'ancien format (objet à clés fixes) et le convertit en liste,
// pour ne pas casser des services déjà enregistrés avant ce changement.
function normalizeFuels(fuels){
  if(Array.isArray(fuels)) return fuels;
  if(fuels && typeof fuels === 'object'){
    return Object.entries(fuels).map(([key, f]) => ({
      id: uid(), type: key, opening: f.opening, closing: f.closing, price: f.price
    }));
  }
  return [];
}

// Migre l'ancienne clé '12kg' vers '12.5kg' pour les services déjà enregistrés
function normalizeGaz(gaz){
  const g = { ...(gaz || {}) };
  if(g['12kg'] && !g['12.5kg']){
    g['12.5kg'] = g['12kg'];
    delete g['12kg'];
  }
  GAS_TYPES.forEach(type => {
    if(!g[type]) g[type] = { opening:0, recharge:0, consigne:0 };
  });
  return g;
}

// Numérote chaque pompe au sein de son type (Super 1, Super 2, Gazole 1...)
function withComputedFuelLabels(fuels){
  const counters = {};
  return (fuels || []).map(f => {
    counters[f.type] = (counters[f.type] || 0) + 1;
    return { ...f, label: fuelTypeLabel(f.type) + ' ' + counters[f.type] };
  });
}

function calculateFuelSale(fuel){
  const opening = num(fuel.opening);
  const closing = num(fuel.closing);
  const price = num(stationConfig?.fuel_prices?.[fuel.type]);
  const qty = Math.max(0, closing - opening);
  return { qty, montant: qty * price };
}

function calculateGazSale(gaz, type){
  const recharge = num(gaz.recharge);
  const consigne = num(gaz.consigne);
  const prices = stationConfig?.gas_prices?.[type] || { recharge:0, bouteilleVide:0 };
  const prixRecharge = num(prices.recharge);
  const prixConsigne = prixRecharge + num(prices.bouteilleVide);
  return { recharge, consigne, montant: recharge * prixRecharge + consigne * prixConsigne };
}

function shiftTotals(d){
  d = d || defaultPompisteState();

  const fuelSales = [];
  let totalCA = 0;

  withComputedFuelLabels(normalizeFuels(d.fuels)).forEach(fuel => {
    const sale = calculateFuelSale(fuel);
    fuelSales.push({ label: fuel.label, qty: sale.qty, montant: sale.montant, type: fuel.type });
    totalCA += sale.montant;
  });

  const gazSales = [];
  Object.entries(normalizeGaz(d.gaz)).forEach(([type, gaz]) => {
    const sale = calculateGazSale(gaz, type);
    gazSales.push({ label: gasTypeLabel(type), recharges: sale.recharge, consignes: sale.consigne, montant: sale.montant });
    totalCA += sale.montant;
  });

  const pay = {};
  VTYPES.forEach(v => { pay[v.key] = 0; });

  (d.versements || []).forEach(v => {
    const key = v.type || 'cash';
    if(pay[key] === undefined) pay[key] = 0;
    pay[key] += num(v.montant);
  });

  const totalRecu = Object.values(pay).reduce((sum, value) => sum + num(value), 0);
  const totalDepenses = (d.depenses || []).reduce((sum, dep) => sum + num(dep.montant), 0);
  const totalCredits = (d.clientCredits || []).reduce((sum, c) => sum + num(c.montant), 0);

  // Écart = reçu + dépenses + ventes à crédit − vendu
  // (une vente à crédit sort du carburant sans mettre d'argent en caisse tout de suite,
  //  elle ne doit donc pas apparaître comme un manquant)
  const ecart = totalRecu + totalDepenses + totalCredits - totalCA;

  return { fuelSales, gazSales, totalCA, totalRecu, totalDepenses, totalCredits, pay, ecart };
}

// ============================================================
// AFFICHAGE DES ESPACES
// ============================================================

function hideAllRoots(){
  ['authScreen','appRoot','supervisorRoot','boutiqueRoot'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.add('hidden');
  });
}

// ============================================================
// NAVIGATION POMPISTE
// ============================================================

// Remonte la page en haut — appelé à chaque changement d'écran
// pour éviter d'atterrir au milieu ou en bas de la nouvelle vue.
function scrollToTop(){
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function showStage(stage){
  document.querySelectorAll('#appRoot .view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + stage);
  if(target) target.classList.add('active');
  scrollToTop();
}

function tab(name){
  document.getElementById('tabServiceBtn').classList.toggle('active', name === 'service');
  document.getElementById('tabHistoryBtn').classList.toggle('active', name === 'history');

  if(name === 'history'){
    loadPompisteHistory();
    showStage('historique');
  }else{
    routePompisteStage();
  }
}

// ============================================================
// AUTHENTIFICATION (formulaire unique)
// ============================================================

async function checkSession(){
  try{
    const { data: { session } } = await sb.auth.getSession();
    if(session && session.user){
      currentUser = session.user;
      await loadCurrentProfile();
      await routeAfterLogin();
    }else{
      showLogin();
    }
  }catch(e){
    console.error('Erreur session :', e);
    showLogin();
  }
}

function showLogin(){
  hideAllRoots();
  const login = document.getElementById('authScreen');
  if(login) login.classList.remove('hidden');
  scrollToTop();
}

function setAuthError(msg){
  const el = document.getElementById('authError');
  if(!el) return;
  if(!msg){
    el.classList.add('hidden');
    el.textContent = '';
  }else{
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function toggleAuth(){
  authMode = authMode === 'login' ? 'signup' : 'login';
  setAuthError(null);

  const nameWrap = document.getElementById('nameWrap');
  const roleWrap = document.getElementById('roleWrap');
  const title = document.getElementById('authTitle');
  const sub = document.getElementById('authSub');
  const btn = document.getElementById('authBtn');
  const switchText = document.getElementById('switchText');
  const switchLink = document.getElementById('switchLink');

  if(authMode === 'signup'){
    nameWrap.classList.remove('hidden');
    roleWrap.classList.remove('hidden');
    title.textContent = 'Créer un compte';
    sub.textContent = 'Renseignez vos informations pour commencer';
    btn.textContent = 'Créer mon compte';
    switchText.textContent = 'Déjà un compte ?';
    switchLink.textContent = 'Se connecter';
  }else{
    nameWrap.classList.add('hidden');
    roleWrap.classList.add('hidden');
    title.textContent = 'Bienvenue 👋';
    sub.textContent = 'Connectez-vous pour accéder à votre service';
    btn.textContent = 'Se connecter';
    switchText.textContent = 'Pas encore de compte ?';
    switchLink.textContent = 'Créer un compte';
  }

  scrollToTop();
}

async function authSubmit(){
  if(authMode === 'signup'){
    await registerUser();
  }else{
    await loginUser();
  }
}

async function loginUser(){
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value;

  if(!email || !password){
    setAuthError('Veuillez renseigner votre e-mail et votre mot de passe.');
    return;
  }

  try{
    setAuthError(null);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw error;

    currentUser = data.user;
    await loadCurrentProfile();
    await routeAfterLogin();
  }catch(e){
    console.error(e);
    setAuthError('Erreur : ' + e.message);
  }
}

async function registerUser(){
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value;
  const fullName = document.getElementById('authName')?.value.trim();
  const role = document.getElementById('authRole')?.value || 'pompiste';

  if(!email || !password || !fullName){
    setAuthError('Tous les champs sont obligatoires.');
    return;
  }

  if(password.length < 6){
    setAuthError('Le mot de passe doit contenir au moins 6 caractères.');
    return;
  }

  try{
    setAuthError(null);

    const { data, error } = await sb.auth.signUp({
      email, password,
      options:{ data:{ full_name: fullName, role } }
    });

    if(error) throw error;

    if(data.user){
      await sb.from('profiles').upsert({ id: data.user.id, full_name: fullName, email, role });
    }

    if(data.session){
      currentUser = data.user;
      await loadCurrentProfile();
      await routeAfterLogin();
    }else{
      setAuthError(null);
      const sub = document.getElementById('authSub');
      sub.textContent = 'Compte créé. Vérifiez vos e-mails puis connectez-vous.';
      toggleAuth();
    }
  }catch(e){
    console.error(e);
    setAuthError('Erreur : ' + e.message);
  }
}

async function logoutUser(){
  try{
    await sb.auth.signOut();
  }catch(e){
    console.warn('Erreur déconnexion :', e.message);
  }

  currentUser = null;
  profileInfo = { id:'', full_name:'', phone:'', email:'', station_name:'', role:'' };
  pompisteState = defaultPompisteState();
  bouState = defaultBoutiqueState();

  showLogin();
}

async function loadCurrentProfile(){
  if(!currentUser) return;

  try{
    const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if(error) throw error;

    profileInfo = {
      id: currentUser.id,
      full_name: data?.full_name || currentUser.user_metadata?.full_name || '',
      phone: data?.phone || '',
      email: data?.email || currentUser.email || '',
      station_name: data?.station_name || '',
      role: data?.role || currentUser.user_metadata?.role || 'pompiste'
    };
  }catch(e){
    console.warn('Profil indisponible :', e.message);
    profileInfo.id = currentUser.id;
    profileInfo.email = currentUser.email || '';
  }
}

async function routeAfterLogin(){
  const role = String(profileInfo.role || 'pompiste').toLowerCase();

  if(role === 'superviseur' || role === 'supervisor'){
    if(typeof initSupervisor === 'function') await initSupervisor();
    return;
  }

  if(role === 'boutique' || role === 'hotesse' || role === 'hôtesse'){
    if(typeof initBoutique === 'function') await initBoutique();
    return;
  }

  await initPompiste();
}

// ============================================================
// INITIALISATION POMPISTE
// ============================================================

async function initPompiste(){
  hideAllRoots();
  const root = document.getElementById('appRoot');
  if(root) root.classList.remove('hidden');

  await loadStationOptions();
  await loadTodayPompisteShift();
  updatePompisteHeader();
}

async function loadStationOptions(){
  try{
    const { data, error } = await sb.from('profiles').select('station_name').not('station_name','is',null);
    if(error) throw error;

    stationOptions = [...new Set((data || []).map(r => r.station_name).filter(Boolean))];

    if(profileInfo.station_name && !stationOptions.includes(profileInfo.station_name)){
      stationOptions.push(profileInfo.station_name);
    }
  }catch(e){
    console.warn('Stations indisponibles :', e.message);
    stationOptions = profileInfo.station_name ? [profileInfo.station_name] : [];
  }
}

async function loadTodayPompisteShift(){
  if(!currentUser) return;

  try{
    const { data, error } = await sb.from('shifts').select('data').eq('user_id', currentUser.id).eq('shift_date', todayDate()).maybeSingle();
    if(error) throw error;

    if(data && data.data && data.data.status){
      pompisteState = mergePompisteState(defaultPompisteState(), data.data);
    }else{
      pompisteState = defaultPompisteState();
    }
  }catch(e){
    console.warn('Chargement service impossible :', e.message);
    pompisteState = defaultPompisteState();
  }

  // Les prix carburant/gaz sont fixés par le superviseur pour la station en cours
  await loadStationConfig(pompisteState.stationName || profileInfo.station_name);

  routePompisteStage();
}

function mergePompisteState(base, saved){
  const result = { ...base, ...saved };
  result.fuels = saved.fuels !== undefined ? normalizeFuels(saved.fuels) : base.fuels;
  result.gaz = normalizeGaz({ ...base.gaz, ...(saved.gaz || {}) });
  result.versements = Array.isArray(saved.versements) ? saved.versements : [];
  result.depenses = Array.isArray(saved.depenses) ? saved.depenses : [];
  result.clientCredits = Array.isArray(saved.clientCredits) ? saved.clientCredits : [];
  return result;
}

async function persistPompiste(){
  if(!currentUser) return false;

  try{
    const { error } = await sb.from('shifts').upsert({
      user_id: currentUser.id,
      shift_date: todayDate(),
      data: pompisteState,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,shift_date' });

    if(error) throw error;
    return true;
  }catch(e){
    console.error('Sauvegarde service :', e.message);
    window._lastShiftError = e.message;
    return false;
  }
}

function routePompisteStage(){
  updatePompisteHeader();

  if(pompisteState.status === 'none'){
    renderPompisteOuverture();
    showStage('ouverture');
  }else if(pompisteState.status === 'open'){
    renderPompisteService();
    showStage('service');
  }else if(pompisteState.status === 'closed'){
    computeAndShowSituation(true);
  }
}

function updatePompisteHeader(){
  const station = pompisteState.stationName || profileInfo.station_name || 'Ma Station';
  const name = pompisteState.pompisteName || profileInfo.full_name || 'Pompiste';

  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  if(statusDot && statusText){
    statusDot.className = 'dot ' + (pompisteState.status === 'open' ? 'open' : pompisteState.status === 'closed' ? 'closed' : '');
    statusText.textContent =
      pompisteState.status === 'open' ? 'Poste ouvert' :
      pompisteState.status === 'closed' ? 'Poste clôturé' :
      'Poste non ouvert';
  }

  const stationEl = document.getElementById('stationName');
  if(stationEl) stationEl.textContent = station;

  const userEl = document.getElementById('userName');
  if(userEl) userEl.textContent = name;
}

// ============================================================
// OUVERTURE DU SERVICE
// ============================================================

function renderPompisteOuverture(){
  const stationSelect = document.getElementById('infoStation');
  const newStation = document.getElementById('infoStationNew');

  if(stationSelect){
    stationSelect.innerHTML =
      '<option value="">— Choisir une station —</option>' +
      stationOptions.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('') +
      '<option value="__new__">➕ Nouvelle station...</option>';

    const current = pompisteState.stationName || profileInfo.station_name || '';

    if(current && stationOptions.includes(current)){
      stationSelect.value = current;
      if(newStation) newStation.classList.add('hidden');
    }else if(current){
      stationSelect.value = '__new__';
      if(newStation){
        newStation.value = current;
        newStation.classList.remove('hidden');
      }
    }

    stationSelect.onchange = function(){
      if(this.value === '__new__'){
        if(newStation){
          newStation.classList.remove('hidden');
          newStation.value = '';
          newStation.focus();
        }
        pompisteState.stationName = '';
      }else{
        if(newStation) newStation.classList.add('hidden');
        pompisteState.stationName = this.value;
      }
    };
  }

  if(newStation){
    newStation.oninput = e => pompisteState.stationName = e.target.value;
  }

  const nameInput = document.getElementById('infoPompiste');
  if(nameInput){
    nameInput.value = pompisteState.pompisteName || profileInfo.full_name || '';
    nameInput.oninput = e => pompisteState.pompisteName = e.target.value;
  }

  const poste = document.getElementById('infoPoste');
  if(poste){
    poste.value = pompisteState.posteNumber || '';
    poste.oninput = e => pompisteState.posteNumber = e.target.value;
  }

  const ilot = document.getElementById('infoIlot');
  if(ilot){
    ilot.value = pompisteState.ilotNumber || '';
    ilot.oninput = e => pompisteState.ilotNumber = e.target.value;
  }
}

async function openPompisteShift(){
  const station = String(pompisteState.stationName || '').trim();
  const name = String(pompisteState.pompisteName || profileInfo.full_name || '').trim();
  const msg = document.getElementById('openStatusMsg');

  if(!station){
    if(msg){ msg.textContent = 'Veuillez choisir ou saisir le nom de la station.'; msg.style.color = 'var(--bad)'; }
    return;
  }

  if(!name){
    if(msg){ msg.textContent = 'Veuillez indiquer le nom du pompiste.'; msg.style.color = 'var(--bad)'; }
    return;
  }

  pompisteState.stationName = station;
  pompisteState.pompisteName = name;
  pompisteState.status = 'open';
  pompisteState.openedAt = new Date().toISOString();

  // Recharge les prix pour la station retenue (peut différer de celle du profil)
  await loadStationConfig(station);

  try{
    await sb.from('profiles').upsert({
      id: currentUser.id, full_name: name, email: profileInfo.email,
      phone: profileInfo.phone, station_name: station, role: 'pompiste'
    });
  }catch(e){
    console.warn('Profil non synchronisé :', e.message);
  }

  const ok = await persistPompiste();

  if(ok){
    if(msg) msg.textContent = '';
    routePompisteStage();
  }else{
    pompisteState.status = 'none';
    if(msg){ msg.textContent = "Échec de l'enregistrement : " + (window._lastShiftError || 'vérifiez votre connexion.'); msg.style.color = 'var(--bad)'; }
  }
}

// ============================================================
// SERVICE EN COURS
// ============================================================

function renderPompisteService(){
  renderFuelFields();
  renderGazFields();
  renderVersements();
  renderDepenses();
  renderClientCredits();
  updateServiceSummary();

  const typeSelect = document.getElementById('versementType');
  if(typeSelect){
    typeSelect.onchange = updateVersementFormForType;
    updateVersementFormForType();
  }
}

// ---------- Carburants (généré dynamiquement) ----------

function renderFuelFields(){
  const box = document.getElementById('pumps');
  if(!box) return;

  const labeled = withComputedFuelLabels(pompisteState.fuels);

  box.innerHTML = labeled.map(fuel => `
    <div class="fuel">
      <div class="fuel-head">
        <span class="fuel-dot" style="background:var(--${fuel.type})"></span>
        ${escapeHtml(fuel.label)}
        <button class="del" style="margin-left:auto" onclick="removeFuelPump('${fuel.id}')" title="Retirer cette pompe">✕</button>
      </div>
      <div class="pump">
        <div><label>Index ouverture</label><input class="input" inputmode="decimal" id="fuel_${fuel.id}_opening" value="${fuel.opening ?? ''}"></div>
        <div><label>Index clôture</label><input class="input" inputmode="decimal" id="fuel_${fuel.id}_closing" value="${fuel.closing ?? ''}"></div>
      </div>
    </div>
  `).join('') + `
    <div class="btnrow" style="margin-top:4px">
      <button class="btn secondary" onclick="addFuelPump('super')">+ Pompe Super</button>
      <button class="btn secondary" onclick="addFuelPump('gazole')">+ Pompe Gazole</button>
    </div>
    <button class="btn secondary big-action" onclick="addFuelPump('petrole')">+ Pompe Pétrole</button>
  `;

  pompisteState.fuels.forEach(fuel => {
    const opening = document.getElementById('fuel_' + fuel.id + '_opening');
    const closing = document.getElementById('fuel_' + fuel.id + '_closing');

    if(opening) opening.oninput = e => { fuel.opening = e.target.value; updateServiceSummary(); };
    if(closing) closing.oninput = e => { fuel.closing = e.target.value; updateServiceSummary(); };

    // Sauvegarde dès qu'on quitte le champ, pour ne rien perdre en cas de fermeture de l'app
    if(opening) opening.onchange = () => persistPompiste();
    if(closing) closing.onchange = () => persistPompiste();
  });
}

async function addFuelPump(type){
  pompisteState.fuels.push({ id: uid(), type, opening:'', closing:'' });
  renderFuelFields();
  updateServiceSummary();
  await persistPompiste();
}

async function removeFuelPump(id){
  if(!confirm('Retirer cette pompe du service du jour ?')) return;
  pompisteState.fuels = pompisteState.fuels.filter(f => f.id !== id);
  renderFuelFields();
  updateServiceSummary();
  await persistPompiste();
}

// ---------- Gaz (généré dynamiquement) ----------

function renderGazFields(){
  const box = document.getElementById('gazBox');
  if(!box) return;

  pompisteState.gaz = normalizeGaz(pompisteState.gaz);

  box.innerHTML = GAS_TYPES.map(type => {
    const gaz = pompisteState.gaz[type];
    return `
    <div class="fuel">
      <div class="fuel-head">🔥 ${escapeHtml(gasTypeLabel(type))}</div>
      <div class="pump">
        <div><label>Stock ouverture</label><input class="input" inputmode="decimal" id="gaz_${type}_opening" value="${gaz.opening ?? 0}"></div>
        <div><label>Recharges vendues</label><input class="input" inputmode="decimal" id="gaz_${type}_recharge" value="${gaz.recharge ?? 0}"></div>
        <div><label>Consignes vendues</label><input class="input" inputmode="decimal" id="gaz_${type}_consigne" value="${gaz.consigne ?? 0}"></div>
      </div>
    </div>
  `;
  }).join('');

  GAS_TYPES.forEach(type => {
    const gaz = pompisteState.gaz[type];
    const opening = document.getElementById('gaz_' + type + '_opening');
    const recharge = document.getElementById('gaz_' + type + '_recharge');
    const consigne = document.getElementById('gaz_' + type + '_consigne');

    if(opening) opening.oninput = e => gaz.opening = num(e.target.value);
    if(recharge) recharge.oninput = e => { gaz.recharge = num(e.target.value); updateServiceSummary(); };
    if(consigne) consigne.oninput = e => { gaz.consigne = num(e.target.value); updateServiceSummary(); };

    if(opening) opening.onchange = () => persistPompiste();
    if(recharge) recharge.onchange = () => persistPompiste();
    if(consigne) consigne.onchange = () => persistPompiste();
  });
}

function updateServiceSummary(){
  const t = shiftTotals(pompisteState);

  const el = document.getElementById('serviceTotalCA');
  if(el) el.textContent = fmt(t.totalCA) + ' F';

  const recu = document.getElementById('serviceTotalRecu');
  if(recu) recu.textContent = fmt(t.totalRecu) + ' F';

  const ecart = document.getElementById('serviceEcart');
  if(ecart) ecart.textContent = (t.ecart > 0 ? '+' : '') + fmt(t.ecart) + ' F';
}

// ---------- Versements ----------

function renderVersements(){
  const box = document.getElementById('versementsList');
  if(!box) return;

  if(!pompisteState.versements.length){
    box.innerHTML = '<div class="empty">Aucun versement enregistré</div>';
  }else{
    box.innerHTML = pompisteState.versements.map(v => {
      const type = VTYPES.find(x => x.key === v.type);
      let sub = v.time || '';
      if(v.reference) sub += ' · Réf. ' + escapeHtml(v.reference);

      return `
        <div class="list-item">
          <span class="ic">${type ? type.ic : '💰'}</span>
          <div class="info">
            <div class="t">${escapeHtml(type ? type.label : v.type)}</div>
            <div class="s">${sub}</div>
          </div>
          <span class="amt">+${fmt(v.montant)} F</span>
          <button class="del" onclick="editVersement('${v.id}')" style="color:var(--amber)">✎</button>
          <button class="del" onclick="removeVersement('${v.id}')">✕</button>
        </div>
      `;
    }).join('');
  }

  const count = document.getElementById('versementCount');
  if(count) count.textContent = pompisteState.versements.length ? `(${pompisteState.versements.length})` : '';
}

function renderVersementsReadOnly(list){
  if(!Array.isArray(list) || !list.length){
    return '<div class="empty">Aucun versement enregistré</div>';
  }

  return list.map(v => {
    const type = VTYPES.find(x => x.key === v.type);
    const label = type ? `${type.ic} ${type.label}` : v.type;

    let sub = v.time || '';
    if(v.reference) sub += ' · Réf. ' + escapeHtml(v.reference);

    return `
      <div class="list-item">
        <span class="ic">${type ? type.ic : '💰'}</span>
        <div class="info">
          <div class="t">${escapeHtml(label)}</div>
          <div class="s">${sub}</div>
        </div>
        <span class="amt">+${fmt(v.montant)} F</span>
      </div>
    `;
  }).join('');
}

async function addVersement(){
  const type = document.getElementById('versementType')?.value || 'cash';
  const montant = num(document.getElementById('versementMontant')?.value);
  const reference = document.getElementById('versementReference')?.value.trim() || '';

  if(montant <= 0){ alert('Veuillez indiquer un montant valide.'); return; }
  if(type === 'voucher' && !reference){ alert('Indiquez ou scannez le numéro du bon.'); return; }

  const time = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

  if(currentEditVersementId){
    const v = pompisteState.versements.find(x => x.id === currentEditVersementId);
    if(v){ v.type = type; v.montant = montant; v.reference = reference; }
    currentEditVersementId = null;
  }else{
    pompisteState.versements.push({ id: uid(), type, montant, reference, time });
  }

  clearVersementForm();
  renderVersements();
  updateServiceSummary();
  await persistPompiste();
}

function clearVersementForm(){
  ['versementMontant','versementReference'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });

  const btn = document.getElementById('addVersementBtn');
  if(btn) btn.textContent = '+ Ajouter le versement';

  clearVoucherButtonSelection();
  updateVersementFormForType();
}

// ---------- Bascule du formulaire selon le moyen de paiement ----------
// Pour "Bon / Voucher" : montant limité à 3 valeurs fixes + numéro de bon obligatoire (scannable)

function updateVersementFormForType(){
  const type = document.getElementById('versementType')?.value || 'cash';
  const isVoucher = type === 'voucher';

  const montantField = document.getElementById('versementMontantField');
  const voucherAmounts = document.getElementById('versementVoucherAmounts');
  const refLabel = document.getElementById('versementReferenceLabel');
  const refInput = document.getElementById('versementReference');
  const scanBtn = document.getElementById('scanVoucherBtn');

  if(montantField) montantField.classList.toggle('hidden', isVoucher);
  if(voucherAmounts) voucherAmounts.classList.toggle('hidden', !isVoucher);
  if(scanBtn) scanBtn.classList.toggle('hidden', !isVoucher);

  if(refLabel) refLabel.textContent = isVoucher ? 'Numéro du bon' : 'Référence (facultatif)';
  if(refInput) refInput.placeholder = isVoucher ? 'Scannez ou saisissez le numéro' : 'Facultatif';

  if(!isVoucher){
    clearVoucherButtonSelection();
  }
}

function clearVoucherButtonSelection(){
  ['voucherBtn5000','voucherBtn10000','voucherBtn15000'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.remove('active');
  });
}

function selectVoucherAmount(amount){
  const montant = document.getElementById('versementMontant');
  if(montant) montant.value = amount;

  clearVoucherButtonSelection();
  const btn = document.getElementById('voucherBtn' + amount);
  if(btn) btn.classList.add('active');
}

// ---------- Scanner QR (numéro du bon) ----------

let qrScannerInstance = null;

function openQrScanner(){
  const overlay = document.getElementById('qrScannerOverlay');
  const errorBox = document.getElementById('qrScannerError');
  if(errorBox){ errorBox.classList.add('hidden'); errorBox.textContent = ''; }
  if(overlay) overlay.classList.remove('hidden');

  if(typeof Html5Qrcode === 'undefined'){
    if(errorBox){ errorBox.textContent = "Le scanner n'a pas pu se charger. Vérifiez votre connexion internet."; errorBox.classList.remove('hidden'); }
    return;
  }

  qrScannerInstance = new Html5Qrcode('qrReaderBox');

  qrScannerInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    (decodedText) => {
      const ref = document.getElementById('versementReference');
      if(ref) ref.value = decodedText.trim();
      closeQrScanner();
    },
    () => { /* frames sans QR détecté : on ignore, c'est normal */ }
  ).catch(err => {
    if(errorBox){
      errorBox.textContent = "Impossible d'accéder à la caméra. Autorisez l'accès caméra dans les réglages du navigateur puis réessayez.";
      errorBox.classList.remove('hidden');
    }
    console.warn('Scanner QR :', err);
  });
}

function closeQrScanner(){
  const overlay = document.getElementById('qrScannerOverlay');
  if(overlay) overlay.classList.add('hidden');

  if(qrScannerInstance){
    qrScannerInstance.stop()
      .then(() => qrScannerInstance.clear())
      .catch(() => {});
    qrScannerInstance = null;
  }
}

function editVersement(id){
  const v = pompisteState.versements.find(x => x.id === id);
  if(!v) return;

  currentEditVersementId = id;

  const type = document.getElementById('versementType');
  const montant = document.getElementById('versementMontant');
  const reference = document.getElementById('versementReference');

  if(type) type.value = v.type;
  if(montant) montant.value = v.montant;
  if(reference) reference.value = v.reference || '';

  updateVersementFormForType();
  if(v.type === 'voucher' && [5000,10000,15000].includes(num(v.montant))){
    const btn = document.getElementById('voucherBtn' + num(v.montant));
    if(btn) btn.classList.add('active');
  }

  const btn = document.getElementById('addVersementBtn');
  if(btn) btn.textContent = '✓ Enregistrer la modification';
}

async function removeVersement(id){
  if(!confirm('Supprimer ce versement ?')) return;

  pompisteState.versements = pompisteState.versements.filter(v => v.id !== id);
  renderVersements();
  updateServiceSummary();
  await persistPompiste();
}

// ---------- Dépenses ----------

function renderDepenses(){
  const box = document.getElementById('depensesList');
  if(!box) return;

  box.innerHTML = (pompisteState.depenses || []).map(dep => `
    <div class="list-item">
      <span class="ic">💸</span>
      <div class="info">
        <div class="t">${escapeHtml(dep.motif)}</div>
        <div class="s">${escapeHtml(dep.time || '')}</div>
      </div>
      <span class="amt">-${fmt(dep.montant)} F</span>
      <button class="del" onclick="editDepense('${dep.id}')" style="color:var(--amber)">✎</button>
      <button class="del" onclick="removeDepense('${dep.id}')">✕</button>
    </div>
  `).join('') || '<div class="empty">Aucune dépense enregistrée</div>';
}

async function addDepense(){
  const motif = document.getElementById('depenseMotif')?.value.trim();
  const montant = num(document.getElementById('depenseMontant')?.value);

  if(!motif){ alert('Indiquez le motif de la dépense.'); return; }
  if(montant <= 0){ alert('Indiquez un montant valide.'); return; }

  const time = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

  if(currentEditDepenseId){
    const dep = pompisteState.depenses.find(d => d.id === currentEditDepenseId);
    if(dep){ dep.motif = motif; dep.montant = montant; }
    currentEditDepenseId = null;
  }else{
    pompisteState.depenses.push({ id: uid(), motif, montant, time });
  }

  clearDepenseForm();
  renderDepenses();
  updateServiceSummary();
  await persistPompiste();
}

function clearDepenseForm(){
  const motif = document.getElementById('depenseMotif');
  const montant = document.getElementById('depenseMontant');
  if(motif) motif.value = '';
  if(montant) montant.value = '';

  const btn = document.getElementById('addDepenseBtn');
  if(btn) btn.textContent = '+ Ajouter la dépense';
}

function editDepense(id){
  const dep = pompisteState.depenses.find(d => d.id === id);
  if(!dep) return;

  currentEditDepenseId = id;

  const motif = document.getElementById('depenseMotif');
  const montant = document.getElementById('depenseMontant');
  if(motif) motif.value = dep.motif;
  if(montant) montant.value = dep.montant;

  const btn = document.getElementById('addDepenseBtn');
  if(btn) btn.textContent = '✓ Enregistrer la modification';
}

async function removeDepense(id){
  if(!confirm('Supprimer cette dépense ?')) return;

  pompisteState.depenses = pompisteState.depenses.filter(d => d.id !== id);
  renderDepenses();
  updateServiceSummary();
  await persistPompiste();
}

// ---------- Ventes à crédit ----------

let currentEditCreditId = null;

function renderClientCredits(){
  const box = document.getElementById('creditsList');
  if(!box) return;

  box.innerHTML = (pompisteState.clientCredits || []).map(c => `
    <div class="list-item">
      <span class="ic">🧾</span>
      <div class="info">
        <div class="t">${escapeHtml(c.client)}</div>
        <div class="s">${escapeHtml(c.time || '')}${c.note ? ' · ' + escapeHtml(c.note) : ''}</div>
      </div>
      <span class="amt">${fmt(c.montant)} F</span>
      <button class="del" onclick="editClientCredit('${c.id}')" style="color:var(--amber)">✎</button>
      <button class="del" onclick="removeClientCredit('${c.id}')">✕</button>
    </div>
  `).join('') || '<div class="empty">Aucune vente à crédit enregistrée</div>';

  const count = document.getElementById('creditCount');
  if(count) count.textContent = (pompisteState.clientCredits || []).length ? `(${pompisteState.clientCredits.length})` : '';
}

function renderClientCreditsReadOnly(list){
  if(!Array.isArray(list) || !list.length){
    return '<div class="empty">Aucune vente à crédit</div>';
  }

  return list.map(c => `
    <div class="list-item">
      <span class="ic">🧾</span>
      <div class="info">
        <div class="t">${escapeHtml(c.client)}</div>
        <div class="s">${escapeHtml(c.time || '')}${c.note ? ' · ' + escapeHtml(c.note) : ''}</div>
      </div>
      <span class="amt">${fmt(c.montant)} F</span>
    </div>
  `).join('');
}

async function addClientCredit(){
  const client = document.getElementById('creditClient')?.value.trim();
  const montant = num(document.getElementById('creditMontant')?.value);
  const note = document.getElementById('creditNote')?.value.trim() || '';

  if(!client){ alert('Indiquez le nom du client.'); return; }
  if(montant <= 0){ alert('Indiquez un montant valide.'); return; }

  const time = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

  if(currentEditCreditId){
    const c = pompisteState.clientCredits.find(c => c.id === currentEditCreditId);
    if(c){ c.client = client; c.montant = montant; c.note = note; }
    currentEditCreditId = null;
  }else{
    pompisteState.clientCredits.push({ id: uid(), client, montant, note, time });
  }

  clearCreditForm();
  renderClientCredits();
  updateServiceSummary();
  await persistPompiste();
}

function clearCreditForm(){
  ['creditClient','creditMontant','creditNote'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });

  const btn = document.getElementById('addCreditBtn');
  if(btn) btn.textContent = '+ Enregistrer la vente à crédit';
}

function editClientCredit(id){
  const c = pompisteState.clientCredits.find(c => c.id === id);
  if(!c) return;

  currentEditCreditId = id;

  const client = document.getElementById('creditClient');
  const montant = document.getElementById('creditMontant');
  const note = document.getElementById('creditNote');

  if(client) client.value = c.client;
  if(montant) montant.value = c.montant;
  if(note) note.value = c.note || '';

  const btn = document.getElementById('addCreditBtn');
  if(btn) btn.textContent = '✓ Enregistrer la modification';
}

async function removeClientCredit(id){
  if(!confirm('Supprimer cette vente à crédit ?')) return;

  pompisteState.clientCredits = pompisteState.clientCredits.filter(c => c.id !== id);
  renderClientCredits();
  updateServiceSummary();
  await persistPompiste();
}

// ============================================================
// CLÔTURE / SITUATION
// ============================================================

function goToClosing(){
  showStage('cloture');
}

function computeAndShowSituation(readOnly = false, historyData = null){
  const d = historyData || pompisteState;
  const t = shiftTotals(d);
  const isHistory = !!historyData;

  const dateEl = document.getElementById('situationDate');
  if(dateEl){
    dateEl.textContent = isHistory && d.closedAt
      ? new Date(d.closedAt).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })
      : new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  }

  const info = document.getElementById('situationInfoBox');
  if(info){
    info.innerHTML = `
      <div class="summary-line"><span>Station</span><span class="v">${escapeHtml(d.stationName || '—')}</span></div>
      <div class="summary-line"><span>Pompiste</span><span class="v">${escapeHtml(d.pompisteName || '—')}</span></div>
      <div class="summary-line"><span>Poste / Îlot</span><span class="v">${escapeHtml(d.posteNumber || '—')} / ${escapeHtml(d.ilotNumber || '—')}</span></div>
    `;
  }

  const box = document.getElementById('situationBox');
  if(box){
    const ok = t.ecart >= 0;
    box.innerHTML = `
      <div class="situation-box ${ok ? 'ok' : 'bad'}">
        <div class="tag">${t.ecart === 0 ? 'Caisse juste' : t.ecart < 0 ? 'Manquant' : 'Excédent'}</div>
        <div class="amount">${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)} F</div>
        <div class="hint">Reçu (${fmt(t.totalRecu)}) + Dépenses (${fmt(t.totalDepenses)}) + Crédits (${fmt(t.totalCredits)}) − Vendu (${fmt(t.totalCA)})</div>
      </div>
    `;
  }

  const fuelBox = document.getElementById('situationFuels');
  if(fuelBox){
    const labeledFuels = withComputedFuelLabels(normalizeFuels(d.fuels));
    fuelBox.innerHTML = labeledFuels.map(f => `
      <div class="summary-line"><span>${escapeHtml(f.label)} <span style="color:var(--muted)">— ${fmt(f.opening)} → ${fmt(f.closing)}</span></span><span class="v">${fmt(calculateFuelSale(f).montant)} F</span></div>
    `).join('') || '<div class="empty">Aucune donnée</div>';
  }

  const gazBox = document.getElementById('situationGaz');
  if(gazBox){
    gazBox.innerHTML = t.gazSales.map(g => `
      <div class="summary-line"><span>${escapeHtml(g.label)} <span style="color:var(--muted)">— ${g.recharges} rech. / ${g.consignes} cons.</span></span><span class="v">${fmt(g.montant)} F</span></div>
    `).join('') || '<div class="empty">Aucune donnée</div>';
  }

  const payBox = document.getElementById('situationPay');
  if(payBox){
    payBox.innerHTML = VTYPES.map(v => `
      <div class="summary-line"><span>${v.ic} ${escapeHtml(v.label)}</span><span class="v">${fmt(t.pay[v.key])} F</span></div>
    `).join('');
  }

  const versementsBox = document.getElementById('situationVersementsList');
  if(versementsBox) versementsBox.innerHTML = renderVersementsReadOnly(d.versements);

  const depensesBox = document.getElementById('situationDepenses');
  if(depensesBox){
    depensesBox.innerHTML = (d.depenses || []).map(dep => `
      <div class="summary-line"><span>${escapeHtml(dep.motif)}</span><span class="v">-${fmt(dep.montant)} F</span></div>
    `).join('') || '<div class="empty">Aucune dépense</div>';
  }

  const creditsBox = document.getElementById('situationCredits');
  if(creditsBox) creditsBox.innerHTML = renderClientCreditsReadOnly(d.clientCredits);

  const finalBox = document.getElementById('situationFinal');
  if(finalBox){
    finalBox.innerHTML = `
      <div class="summary-line total"><span>Vendu théorique</span><span class="v">${fmt(t.totalCA)} F</span></div>
      <div class="summary-line total"><span>Total reçu</span><span class="v">${fmt(t.totalRecu)} F</span></div>
      <div class="summary-line total"><span>Total dépenses</span><span class="v">${fmt(t.totalDepenses)} F</span></div>
      <div class="summary-line total"><span>Total ventes à crédit</span><span class="v">${fmt(t.totalCredits)} F</span></div>
    `;
  }

  const liveButtons = document.getElementById('situationLiveButtons');
  const logoutBtn = document.getElementById('situationLogoutBtn');
  const historyButtons = document.getElementById('situationHistoryButtons');

  if(liveButtons) liveButtons.classList.toggle('hidden', isHistory);
  if(logoutBtn) logoutBtn.classList.toggle('hidden', isHistory);
  if(historyButtons) historyButtons.classList.toggle('hidden', !isHistory);

  window._lastSituation = t;
  window._lastSituationData = d;
  showStage('situation');
}

async function closePompisteShift(){
  const sigInput = document.getElementById('signatureInput');
  const signature = sigInput ? sigInput.value.trim() : '';
  const msg = document.getElementById('signatureMsg');

  if(!signature){
    if(msg){ msg.textContent = 'Veuillez taper votre nom pour signer avant de clôturer.'; msg.style.color = 'var(--bad)'; }
    return;
  }

  pompisteState.signature = signature;
  pompisteState.status = 'closed';
  pompisteState.closedAt = new Date().toISOString();

  const ok = await persistPompiste();

  if(ok){
    if(msg){ msg.textContent = '✓ Service clôturé et archivé.'; msg.style.color = 'var(--good)'; }
    computeAndShowSituation(true);
  }else{
    if(msg){ msg.textContent = "Échec de l'enregistrement : " + (window._lastShiftError || 'vérifiez votre connexion.'); msg.style.color = 'var(--bad)'; }
  }
}

async function backToService(){
  // Si le poste avait été clôturé, on le rouvre pour permettre la correction
  // (il faudra re-signer pour le re-clôturer)
  if(pompisteState.status === 'closed'){
    pompisteState.status = 'open';
    await persistPompiste();
  }

  renderPompisteService();
  showStage('service');
}

function shareSituationWhatsApp(){
  const t = window._lastSituation;
  const d = window._lastSituationData;
  if(!t || !d) return;

  const dateStr = d.closedAt
    ? new Date(d.closedAt).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  let msg = `*Situation service du ${dateStr}*\n`;
  if(d.stationName) msg += `Station : ${d.stationName}\n`;
  if(d.pompisteName) msg += `Pompiste : ${d.pompisteName}\n`;
  if(d.posteNumber || d.ilotNumber) msg += `Poste / Îlot : ${d.posteNumber || '—'} / ${d.ilotNumber || '—'}\n`;

  msg += `\n⛽ *INDEX CARBURANTS*\n`;
  const labeledFuels = withComputedFuelLabels(normalizeFuels(d.fuels));
  if(!labeledFuels.length){
    msg += `Aucune donnée\n`;
  }else{
    labeledFuels.forEach(fuel => {
      const sale = calculateFuelSale(fuel);
      msg += `${fuel.label} : ${fmt(fuel.opening)} → ${fmt(fuel.closing)} (${sale.qty.toFixed(1)} L) = ${fmt(sale.montant)} F\n`;
    });
  }

  msg += `\n🔥 *GAZ*\n`;
  Object.entries(normalizeGaz(d.gaz)).forEach(([type, gaz]) => {
    const sale = calculateGazSale(gaz, type);
    msg += `${gasTypeLabel(type)} : ${gaz.recharge} rech. / ${gaz.consigne} cons. = ${fmt(sale.montant)} F\n`;
  });

  const versements = d.versements || [];
  msg += `\n💳 *VERSEMENTS* (${versements.length})\n`;
  if(!versements.length){
    msg += `Aucun\n`;
  }else{
    versements.forEach(v => {
      const type = VTYPES.find(x => x.key === v.type);
      let line = `${v.time || ''} ${type ? type.label : v.type} : +${fmt(v.montant)} F`;
      if(v.reference) line += ` · Réf. ${v.reference}`;
      msg += line + '\n';
    });
  }

  const depenses = d.depenses || [];
  msg += `\n🧺 *DÉPENSES* (${depenses.length})\n`;
  if(!depenses.length){
    msg += `Aucune\n`;
  }else{
    depenses.forEach(dep => {
      msg += `${dep.time || ''} ${dep.motif} : -${fmt(dep.montant)} F\n`;
    });
  }

  const credits = d.clientCredits || [];
  if(credits.length){
    msg += `\n🧾 *VENTES À CRÉDIT* (${credits.length})\n`;
    credits.forEach(c => {
      let line = `${c.time || ''} ${c.client} : ${fmt(c.montant)} F`;
      if(c.note) line += ` · ${c.note}`;
      msg += line + '\n';
    });
  }

  msg += `\n*RÉCAPITULATIF*\n`;
  msg += `Vendu théorique : ${fmt(t.totalCA)} F\n`;
  msg += `Total reçu : ${fmt(t.totalRecu)} F\n`;
  msg += `Dépenses : ${fmt(t.totalDepenses)} F\n`;
  msg += `Ventes à crédit : ${fmt(t.totalCredits)} F\n`;
  msg += `Écart : ${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)} F ${t.ecart < 0 ? '(manquant)' : t.ecart > 0 ? '(excédent)' : '(caisse juste)'}\n`;

  if(d.signature) msg += `\n_Signé par ${d.signature}_`;

  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// ============================================================
// HISTORIQUE POMPISTE
// ============================================================

async function loadPompisteHistory(){
  const box = document.getElementById('history');
  if(!box || !currentUser) return;

  box.innerHTML = '<div class="empty">Chargement…</div>';

  try{
    const { data, error } = await sb.from('shifts')
      .select('shift_date,data')
      .eq('user_id', currentUser.id)
      .order('shift_date', { ascending:false })
      .limit(90);

    if(error) throw error;

    historyCache = (data || []).filter(r => r.data && r.data.status === 'closed');

    if(!historyCache.length){
      box.innerHTML = '<div class="empty">Aucune journée clôturée pour le moment.</div>';
      return;
    }

    box.innerHTML = historyCache.map(r => {
      const t = shiftTotals(r.data);
      const d = new Date(r.shift_date + 'T00:00:00');
      return `
        <div class="hist-item" onclick="openPompisteHistoryDetail('${r.shift_date}')" style="cursor:pointer">
          <div class="date">
            ${d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}
            <small>Vendu ${fmt(t.totalCA)} F · Reçu ${fmt(t.totalRecu)} F</small>
          </div>
          <div class="he ${t.ecart < 0 ? 'bad' : 'good'}">${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)}</div>
        </div>
      `;
    }).join('');
  }catch(e){
    box.innerHTML = '<div class="empty">Erreur de chargement : ' + escapeHtml(e.message) + '</div>';
  }
}

function openPompisteHistoryDetail(dateStr){
  const row = historyCache.find(r => r.shift_date === dateStr);
  if(!row) return;

  computeAndShowSituation(true, row.data);
}

// ============================================================
// INITIALISATION AUTOMATIQUE
// ============================================================

document.addEventListener('DOMContentLoaded', async function(){
  try{
    await checkSession();
  }catch(e){
    console.error('Initialisation :', e);
  }
});

sb.auth.onAuthStateChange(async (event, session) => {
  if(event === 'SIGNED_IN' && session?.user){
    currentUser = session.user;
    await loadCurrentProfile();
  }

  if(event === 'SIGNED_OUT'){
    currentUser = null;
    showLogin();
  }
});

// ============================================================
// ESPACE SUPERVISEUR
// ============================================================

function showSupStage(stage){
  document.querySelectorAll('#supervisorRoot .view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-sup-' + stage);
  if(target) target.classList.add('active');
  scrollToTop();
}

async function initSupervisor(){
  hideAllRoots();
  const root = document.getElementById('supervisorRoot');
  if(root) root.classList.remove('hidden');

  if(!profileInfo.station_name){
    showSupStage('station-setup');
  }else{
    document.getElementById('supStationName').textContent = profileInfo.station_name;
    document.getElementById('supStationLine').textContent = 'Superviseur — ' + profileInfo.station_name;
    showSupStage('list');
    await loadSupervisorPompistes();
  }
}

async function saveSupervisorStation(){
  const val = document.getElementById('supStationInput').value.trim();
  const msg = document.getElementById('supSetupMsg');

  if(!val){
    msg.textContent = 'Indiquez le nom de la station.';
    msg.style.color = 'var(--bad)';
    return;
  }

  try{
    const { error } = await sb.from('profiles').upsert({ id: currentUser.id, station_name: val, role: 'superviseur' });
    if(error) throw error;

    profileInfo.station_name = val;
    document.getElementById('supStationName').textContent = val;
    document.getElementById('supStationLine').textContent = 'Superviseur — ' + val;

    showSupStage('list');
    await loadSupervisorPompistes();
  }catch(e){
    msg.textContent = 'Erreur : ' + e.message;
    msg.style.color = 'var(--bad)';
  }
}

// ============================================================
// CONFIGURATION DES PRIX (superviseur uniquement)
// ============================================================

async function openSupervisorPrices(){
  if(!profileInfo.station_name){
    alert('Configurez d\'abord le nom de votre station.');
    return;
  }

  await loadStationConfig(profileInfo.station_name);

  const label = document.getElementById('supPricesStationLabel');
  if(label) label.textContent = profileInfo.station_name;

  renderSupPricesForm();
  showSupStage('prices');
}

function renderSupPricesForm(){
  const fp = stationConfig.fuel_prices;
  document.getElementById('supPriceSuper').value = fp.super || '';
  document.getElementById('supPriceGazole').value = fp.gazole || '';
  document.getElementById('supPricePetrole').value = fp.petrole || '';

  const gasFieldMap = { '6kg':'supGas6kg', '12.5kg':'supGas125kg', '35kg':'supGas35kg' };

  GAS_TYPES.forEach(type => {
    const prefix = gasFieldMap[type];
    const prices = stationConfig.gas_prices[type] || { recharge:0, bouteilleVide:0 };

    document.getElementById(prefix + 'Recharge').value = prices.recharge || '';
    document.getElementById(prefix + 'Bouteille').value = prices.bouteilleVide || '';
    updateSupGasConsigneDisplay(type, prefix);

    document.getElementById(prefix + 'Recharge').oninput = () => updateSupGasConsigneDisplay(type, prefix);
    document.getElementById(prefix + 'Bouteille').oninput = () => updateSupGasConsigneDisplay(type, prefix);
  });

  renderStationProductsList();
}

function updateSupGasConsigneDisplay(type, prefix){
  const recharge = num(document.getElementById(prefix + 'Recharge').value);
  const bouteille = num(document.getElementById(prefix + 'Bouteille').value);
  const el = document.getElementById(prefix + 'Consigne');
  if(el) el.textContent = fmt(recharge + bouteille) + ' F';
}

async function saveSupFuelPrices(){
  stationConfig.fuel_prices = {
    super: num(document.getElementById('supPriceSuper').value),
    gazole: num(document.getElementById('supPriceGazole').value),
    petrole: num(document.getElementById('supPricePetrole').value)
  };

  const ok = await persistStationConfig(profileInfo.station_name);
  const msg = document.getElementById('supFuelPricesMsg');

  if(msg){
    msg.textContent = ok ? '✓ Prix carburants enregistrés.' : "Échec de l'enregistrement.";
    msg.style.color = ok ? 'var(--good)' : 'var(--bad)';
  }
}

async function saveSupGasPrices(){
  const gasFieldMap = { '6kg':'supGas6kg', '12.5kg':'supGas125kg', '35kg':'supGas35kg' };

  GAS_TYPES.forEach(type => {
    const prefix = gasFieldMap[type];
    stationConfig.gas_prices[type] = {
      recharge: num(document.getElementById(prefix + 'Recharge').value),
      bouteilleVide: num(document.getElementById(prefix + 'Bouteille').value)
    };
  });

  const ok = await persistStationConfig(profileInfo.station_name);
  const msg = document.getElementById('supGasPricesMsg');

  if(msg){
    msg.textContent = ok ? '✓ Prix gaz enregistrés.' : "Échec de l'enregistrement.";
    msg.style.color = ok ? 'var(--good)' : 'var(--bad)';
  }
}

// ---------- Catalogue boutique (géré uniquement par le superviseur) ----------

let currentEditStationProdId = null;

function renderStationProductsList(){
  const box = document.getElementById('supProdList');
  if(!box) return;

  const products = stationConfig.boutique_products || [];

  box.innerHTML = products.map(p => `
    <div class="list-item">
      <span class="ic">📦</span>
      <div class="info"><div class="t">${escapeHtml(p.name)}</div><div class="s">${fmt(p.price)} FCFA / unité</div></div>
      <button class="del" onclick="editStationProduct('${p.id}')" style="color:var(--amber)">✎</button>
      <button class="del" onclick="removeStationProduct('${p.id}')">✕</button>
    </div>
  `).join('') || '<div class="empty">Aucun produit enregistré — ajoutez-en un ci-dessus</div>';
}

async function addStationProduct(){
  const name = document.getElementById('supProdName').value.trim();
  const price = num(document.getElementById('supProdPrice').value);

  if(!name){ alert('Indiquez le nom du produit.'); return; }
  if(price <= 0){ alert('Indiquez un prix.'); return; }

  if(currentEditStationProdId){
    const p = stationConfig.boutique_products.find(p => p.id === currentEditStationProdId);
    if(p){ p.name = name; p.price = price; }
    cancelEditStationProduct();
  }else{
    stationConfig.boutique_products.push({ id: uid(), name, price });
    document.getElementById('supProdName').value = '';
    document.getElementById('supProdPrice').value = '';
  }

  renderStationProductsList();
  await persistStationConfig(profileInfo.station_name);
}

function editStationProduct(id){
  const p = stationConfig.boutique_products.find(p => p.id === id);
  if(!p) return;

  currentEditStationProdId = id;
  document.getElementById('supProdName').value = p.name;
  document.getElementById('supProdPrice').value = p.price;
  document.getElementById('supAddProdBtn').textContent = '✓ Enregistrer la modification';
  document.getElementById('supCancelProdEditBtn').classList.remove('hidden');
}

function cancelEditStationProduct(){
  currentEditStationProdId = null;
  document.getElementById('supProdName').value = '';
  document.getElementById('supProdPrice').value = '';
  document.getElementById('supAddProdBtn').textContent = '+ Ajouter au catalogue';
  document.getElementById('supCancelProdEditBtn').classList.add('hidden');
}

async function removeStationProduct(id){
  if(!confirm('Supprimer ce produit du catalogue ?')) return;

  stationConfig.boutique_products = stationConfig.boutique_products.filter(p => p.id !== id);
  renderStationProductsList();
  await persistStationConfig(profileInfo.station_name);
}

async function loadSupervisorPompistes(){
  const box = document.getElementById('supPompisteList');
  box.innerHTML = '<div class="empty">Chargement…</div>';

  try{
    const { data: pompistes, error } = await sb.from('profiles')
      .select('id,full_name')
      .eq('station_name', profileInfo.station_name)
      .eq('role', 'pompiste');

    if(error) throw error;

    if(!pompistes || !pompistes.length){
      box.innerHTML = '<div class="empty">Aucun pompiste trouvé pour cette station pour l\u2019instant.</div>';
      return;
    }

    const today = todayDate();
    const rows = [];

    for(const p of pompistes){
      const { data: shift } = await sb.from('shifts').select('data').eq('user_id', p.id).eq('shift_date', today).maybeSingle();
      rows.push({ profile: p, shift: shift ? shift.data : null });
    }

    box.innerHTML = rows.map(r => {
      const st = r.shift ? r.shift.status : 'none';
      const label = st === 'open' ? 'Poste ouvert' : st === 'closed' ? 'Poste clôturé' : 'Pas encore commencé';
      const dotClass = st === 'open' ? 'open' : st === 'closed' ? 'closed' : 'none';

      let ecartTxt = '';
      if(st === 'closed'){
        const t = shiftTotals(r.shift);
        ecartTxt = ` · ${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)} F`;
      }

      const safeName = escapeHtml(r.profile.full_name || 'Sans nom').replace(/'/g, "\\'");

      return `
        <div class="hist-item" style="cursor:default">
          <div class="hd" onclick="openSupervisorDetail('${r.profile.id}')" style="cursor:pointer;flex:1">
            <div class="date">${escapeHtml(r.profile.full_name || 'Sans nom')}</div>
            <div class="sub"><span class="status-dot ${dotClass}" style="display:inline-block;margin-right:4px"></span>${label}${ecartTxt}</div>
          </div>
          <button class="del" onclick="openSupervisorHistory('${r.profile.id}','${safeName}')" style="font-size:11px;white-space:nowrap;color:var(--amber)">📅 Historique</button>
        </div>
      `;
    }).join('');
  }catch(e){
    box.innerHTML = '<div class="empty">Erreur de chargement : ' + escapeHtml(e.message) + '</div>';
  }
}

async function openSupervisorDetail(pompisteId){
  const { data, error } = await sb.from('shifts').select('data').eq('user_id', pompisteId).eq('shift_date', todayDate()).maybeSingle();
  const { data: profRow } = await sb.from('profiles').select('full_name').eq('id', pompisteId).maybeSingle();

  if(error || !data || !data.data || data.data.status === 'none'){
    alert("Ce pompiste n'a pas encore ouvert son poste aujourd'hui.");
    return;
  }

  renderSupervisorDay(profRow?.full_name || '—', data.data, new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' }));

  document.getElementById('supDetailBackLink').setAttribute('onclick', "showSupStage('list')");
  document.getElementById('supDetailBackLink').textContent = '← Retour à la liste';

  showSupStage('detail');
}

let supHistoryCache = [];

async function openSupervisorHistory(pompisteId, pompisteName){
  document.getElementById('supHistoryTitle').textContent = 'Historique — ' + pompisteName;

  const box = document.getElementById('supHistoryList');
  box.innerHTML = '<div class="empty">Chargement…</div>';

  showSupStage('history');

  try{
    const { data, error } = await sb.from('shifts')
      .select('shift_date,data')
      .eq('user_id', pompisteId)
      .order('shift_date', { ascending:false })
      .limit(90);

    if(error) throw error;

    supHistoryCache = (data || []).filter(r => r.data && r.data.status === 'closed');

    if(!supHistoryCache.length){
      box.innerHTML = '<div class="empty">Aucune journée clôturée pour ce pompiste.</div>';
      return;
    }

    box.innerHTML = supHistoryCache.map(r => {
      const t = shiftTotals(r.data);
      const d = new Date(r.shift_date + 'T00:00:00');
      const safeName = pompisteName.replace(/'/g, "\\'");

      return `
        <div class="hist-item" onclick="openSupervisorDayDetail('${r.shift_date}','${safeName}')">
          <div class="hd">
            <div class="date">${d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}</div>
            <div class="sub">Vendu ${fmt(t.totalCA)} F · Reçu ${fmt(t.totalRecu)} F</div>
          </div>
          <div class="he ${t.ecart < 0 ? 'bad' : 'good'}">${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)}</div>
        </div>
      `;
    }).join('');
  }catch(e){
    box.innerHTML = '<div class="empty">Erreur de chargement : ' + escapeHtml(e.message) + '</div>';
  }
}

function openSupervisorDayDetail(dateStr, pompisteName){
  const row = supHistoryCache.find(r => r.shift_date === dateStr);
  if(!row) return;

  const dObj = new Date(dateStr + 'T00:00:00');

  renderSupervisorDay(pompisteName, row.data, dObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }));

  document.getElementById('supDetailBackLink').setAttribute('onclick', "showSupStage('history')");
  document.getElementById('supDetailBackLink').textContent = '← Retour à l\u2019historique';

  showSupStage('detail');
}

function renderSupervisorDay(pompisteName, d, dateLabel){
  const t = shiftTotals(d);
  const ok = t.ecart >= 0;

  document.getElementById('supDetailInfoBox').innerHTML = `
    <div class="summary-line"><span>Pompiste</span><span class="v">${escapeHtml(pompisteName || '—')}</span></div>
    <div class="summary-line"><span>Poste / Îlot</span><span class="v">${escapeHtml(d.posteNumber || '—')} / ${escapeHtml(d.ilotNumber || '—')}</span></div>
    <div class="summary-line"><span>Statut</span><span class="v">${d.status === 'closed' ? 'Clôturé' : 'En cours'}</span></div>
    <div class="summary-line"><span>Signé par</span><span class="v" style="color:var(--good)">${escapeHtml(d.signature || '—')}</span></div>
  `;

  document.getElementById('supDetailBox').innerHTML = `
    <div class="situation-box ${ok ? 'ok' : 'bad'}">
      <div class="tag">${dateLabel}</div>
      <div class="amount">${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)} F</div>
      <div class="hint">Reçu (${fmt(t.totalRecu)}) + Crédits (${fmt(t.totalCredits)}) − Vendu (${fmt(t.totalCA)})</div>
    </div>
  `;

  document.getElementById('supDetailFuels').innerHTML = t.fuelSales.map(f => `
    <div class="summary-line"><span>${escapeHtml(f.label)} <span style="color:var(--muted)">— ${f.qty.toFixed(1)} L</span></span><span class="v">${fmt(f.montant)}</span></div>
  `).join('') || '<div class="empty">Aucune donnée</div>';

  document.getElementById('supDetailGaz').innerHTML = t.gazSales.map(g => `
    <div class="summary-line"><span>${escapeHtml(g.label)} <span style="color:var(--muted)">— ${g.recharges} rech. / ${g.consignes} cons.</span></span><span class="v">${fmt(g.montant)}</span></div>
  `).join('') || '<div class="empty">Aucune donnée</div>';

  document.getElementById('supDetailPay').innerHTML = VTYPES.map(v => `
    <div class="summary-line"><span>${v.ic} ${escapeHtml(v.label)}</span><span class="v">${fmt(t.pay[v.key])}</span></div>
  `).join('');

  document.getElementById('supDetailVersementsList').innerHTML = renderVersementsReadOnly(d.versements);

  document.getElementById('supDetailDepenses').innerHTML = (d.depenses || []).map(dep => `
    <div class="summary-line"><span>${escapeHtml(dep.motif)}</span><span class="v">-${fmt(dep.montant)}</span></div>
  `).join('') || '<div class="empty">Aucune dépense</div>';

  document.getElementById('supDetailCredits').innerHTML = renderClientCreditsReadOnly(d.clientCredits);

  document.getElementById('supDetailFinal').innerHTML = `
    <div class="summary-line total"><span>Vendu théorique</span><span class="v">${fmt(t.totalCA)} F</span></div>
    <div class="summary-line total"><span>Reçu total</span><span class="v">${fmt(t.totalRecu)} F</span></div>
    <div class="summary-line total"><span>Total ventes à crédit</span><span class="v">${fmt(t.totalCredits)} F</span></div>
  `;

  showSupStage('detail');
}

// ============================================================
// ESPACE BOUTIQUE
// ============================================================

const BOU_OPTYPES = [
  { key:'depot', label:'Dépôt', ic:'⬇️' },
  { key:'retrait', label:'Retrait', ic:'⬆️' },
  { key:'vente', label:'Vente', ic:'🛒' }
];

let bouState = defaultBoutiqueState();

let currentBouOpType = 'depot';
let currentBouStage = 'ouverture';

let currentEditOpId = null;

let bouHistoryCache = [];

function defaultBoutiqueState(){
  return {
    status:'none', openedAt:null, closedAt:null,
    stationName:'', hotesseName:'', signature:'',
    fondsCaisse:'', montantCompte:'',
    retraits:[], depots:[], ventes:[]
  };
}

async function initBoutique(){
  hideAllRoots();
  const root = document.getElementById('boutiqueRoot');
  if(root) root.classList.remove('hidden');

  await loadStationOptions();
  await loadTodayBoutiqueShift();
  // Le catalogue vient de la config de station (fixée par le superviseur) — chargé
  // dès que la station de l'hôtesse est connue, via loadTodayBoutiqueShift -> routeBouStage.
}

// ---------- Catalogue produits (lecture seule pour l'hôtesse — géré par le superviseur) ----------

function renderBoutiqueCatalogue(){
  const products = (stationConfig?.boutique_products) || [];

  document.getElementById('bouProdCount').textContent = products.length ? `(${products.length})` : '';

  document.getElementById('bouProdList').innerHTML = products.map(p => `
    <div class="list-item">
      <span class="ic">📦</span>
      <div class="info"><div class="t">${escapeHtml(p.name)}</div><div class="s">${fmt(p.price)} FCFA / unité</div></div>
    </div>
  `).join('') || '<div class="empty">Aucun produit dans le catalogue — demandez au superviseur d\'en ajouter</div>';
}

// ---------- Navigation ----------

function showBouStage(stage){
  currentBouStage = stage;
  document.querySelectorAll('#boutiqueRoot .view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-bou-' + stage);
  if(target) target.classList.add('active');
  scrollToTop();
}

function switchBouTab(tabName){
  document.querySelectorAll('.tab[data-bou-tab]').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.tab[data-bou-tab="${tabName}"]`);
  if(activeTab) activeTab.classList.add('active');

  if(tabName === 'historique'){
    loadBoutiqueHistory();
    showBouStage('historique');
  }else if(tabName === 'catalogue'){
    renderBoutiqueCatalogue();
    showBouStage('catalogue');
  }else{
    routeBouStage();
  }
}

function routeBouStage(){
  updateBouStatusHeader();

  if(bouState.status === 'none'){
    renderBoutiqueOuverture();
    showBouStage('ouverture');
  }else if(bouState.status === 'open'){
    renderBoutiqueService();
    showBouStage('service');
  }else{
    computeAndShowBoutiqueSituation(true);
  }

  const serviceTab = document.querySelector('.tab[data-bou-tab="service"]');
  const catalogueTab = document.querySelector('.tab[data-bou-tab="catalogue"]');
  const historiqueTab = document.querySelector('.tab[data-bou-tab="historique"]');

  if(serviceTab) serviceTab.classList.add('active');
  if(catalogueTab) catalogueTab.classList.remove('active');
  if(historiqueTab) historiqueTab.classList.remove('active');
}

function updateBouStatusHeader(){
  const dot = document.getElementById('bouStatusDot');
  const txt = document.getElementById('bouStatusText');
  if(!dot || !txt) return;

  dot.className = 'status-dot ' + (bouState.status === 'open' ? 'open' : bouState.status === 'closed' ? 'closed' : 'none');

  if(bouState.status === 'open'){
    txt.textContent = 'Boutique ouverte depuis ' + (bouState.openedAt ? new Date(bouState.openedAt).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '');
  }else if(bouState.status === 'closed'){
    txt.textContent = 'Boutique clôturée — ' + new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
  }else{
    txt.textContent = 'Boutique non ouverte — ' + new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
  }
}

// ---------- Persistance ----------

async function loadTodayBoutiqueShift(){
  try{
    const { data, error } = await sb.from('shifts').select('data').eq('user_id', currentUser.id).eq('shift_date', todayDate()).maybeSingle();
    if(error) throw error;

    if(data && data.data && data.data.status && data.data.status !== 'none'){
      const saved = data.data;
      const def = defaultBoutiqueState();

      bouState = Object.assign(def, saved);
      bouState.retraits = Array.isArray(saved.retraits) ? saved.retraits : [];
      bouState.depots = Array.isArray(saved.depots) ? saved.depots : [];
      bouState.ventes = Array.isArray(saved.ventes) ? saved.ventes : [];
    }else{
      bouState = defaultBoutiqueState();
    }
  }catch(e){
    console.warn('Chargement impossible :', e.message);
    bouState = defaultBoutiqueState();
  }

  await loadStationConfig(bouState.stationName || profileInfo.station_name);

  routeBouStage();
}

async function persistBoutique(){
  try{
    const { error } = await sb.from('shifts').upsert({
      user_id: currentUser.id, shift_date: todayDate(), data: bouState, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,shift_date' });

    if(error) throw error;
    return true;
  }catch(e){
    console.warn('Sauvegarde impossible :', e.message);
    return false;
  }
}

// ---------- Ouverture ----------

function renderBoutiqueOuverture(){
  const currentStation = bouState.stationName || profileInfo.station_name || '';
  const sel = document.getElementById('bouInfoStation');
  const newInput = document.getElementById('bouInfoStationNew');
  if(!sel || !newInput) return;

  sel.innerHTML = '<option value="">— Choisir une station —</option>'
    + stationOptions.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')
    + '<option value="__new__">➕ Nouvelle station...</option>';

  if(currentStation && stationOptions.includes(currentStation)){
    sel.value = currentStation;
    newInput.classList.add('hidden');
  }else if(currentStation){
    sel.value = '__new__';
    newInput.value = currentStation;
    newInput.classList.remove('hidden');
  }else{
    newInput.classList.add('hidden');
  }

  sel.onchange = e => {
    if(e.target.value === '__new__'){
      newInput.classList.remove('hidden');
      newInput.value = '';
      newInput.focus();
      bouState.stationName = '';
    }else{
      newInput.classList.add('hidden');
      bouState.stationName = e.target.value;
    }
  };

  newInput.oninput = e => bouState.stationName = e.target.value;

  document.getElementById('bouInfoHotesse').value = bouState.hotesseName || profileInfo.full_name || '';
  document.getElementById('bouInfoHotesse').oninput = e => bouState.hotesseName = e.target.value;

  document.getElementById('bouFondsCaisse').value = bouState.fondsCaisse || '';
  document.getElementById('bouFondsCaisse').oninput = e => bouState.fondsCaisse = e.target.value;
}

async function openBoutiqueShift(){
  if(!bouState.stationName || !bouState.stationName.trim()){
    document.getElementById('bouOuvStatusMsg').textContent = 'Veuillez choisir ou saisir le nom de la station.';
    document.getElementById('bouOuvStatusMsg').style.color = 'var(--bad)';
    return;
  }

  bouState.status = 'open';
  bouState.openedAt = new Date().toISOString();

  await loadStationConfig(bouState.stationName);

  try{
    await sb.from('profiles').upsert({
      id: currentUser.id,
      full_name: bouState.hotesseName || profileInfo.full_name,
      station_name: bouState.stationName || profileInfo.station_name
    });
  }catch(e){
    console.warn('Synchronisation du profil impossible :', e.message);
  }

  const ok = await persistBoutique();
  const msg = document.getElementById('bouOuvStatusMsg');

  if(ok){
    routeBouStage();
  }else{
    msg.textContent = "Échec de l'enregistrement — vérifiez votre connexion.";
  }
}

// ---------- Journée : opérations ----------

function renderBoutiqueService(){
  renderBouOpGrid();
  renderBouOpFields();
  renderBouOpList();
}

function renderBouOpGrid(){
  document.getElementById('bouOpGrid').innerHTML = BOU_OPTYPES.map(t => `
    <div class="vtype-btn ${t.key === currentBouOpType ? 'active' : ''}" onclick="selectBouOpType('${t.key}')">
      <span class="ic">${t.ic}</span><span class="lb">${escapeHtml(t.label)}</span>
    </div>
  `).join('');
}

function selectBouOpType(key){
  currentBouOpType = key;
  renderBouOpGrid();
  renderBouOpFields();
}

function renderBouOpFields(){
  const box = document.getElementById('bouOpFields');
  const products = (stationConfig?.boutique_products) || [];

  if(currentBouOpType === 'vente'){
    if(!products.length){
      box.innerHTML = '<div class="empty">Aucun produit dans le catalogue — demandez au superviseur d\'en ajouter.</div>';
      return;
    }

    box.innerHTML = `
      <select class="note-input" id="bouVenteProduit">
        ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} — ${fmt(p.price)} F</option>`).join('')}
      </select>
      <div class="stock-row">
        <div class="field"><span class="field-label">Quantité</span><input class="led-input" id="bouVenteQte" inputmode="numeric" value="1"></div>
        <div class="field"><span class="field-label">Total</span><input class="led-input" id="bouVenteTotal" disabled></div>
      </div>
    `;

    document.getElementById('bouVenteProduit').onchange = updateBouVenteTotal;
    document.getElementById('bouVenteQte').oninput = updateBouVenteTotal;
    updateBouVenteTotal();
  }else{
    box.innerHTML = `<input class="led-input" style="margin-bottom:10px" id="bouOpMontant" inputmode="decimal" placeholder="Montant (FCFA)">`;
  }
}

function updateBouVenteTotal(){
  const products = (stationConfig?.boutique_products) || [];
  const prodId = document.getElementById('bouVenteProduit').value;
  const prod = products.find(p => p.id === prodId);
  const qte = num(document.getElementById('bouVenteQte').value) || 0;
  document.getElementById('bouVenteTotal').value = prod ? fmt(prod.price * qte) : 0;
}

async function addBoutiqueOp(){
  const note = document.getElementById('bouOpNote').value.trim();
  const time = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  const products = (stationConfig?.boutique_products) || [];

  if(currentBouOpType === 'vente'){
    if(!products.length){ alert("Ajoutez au moins un produit au catalogue avant d'enregistrer une vente."); return; }

    const prodId = document.getElementById('bouVenteProduit').value;
    const prod = products.find(p => p.id === prodId);
    const qte = num(document.getElementById('bouVenteQte').value);

    if(!prod || qte <= 0){ alert('Choisissez un produit et une quantité valide.'); return; }

    const montant = prod.price * qte;

    if(currentEditOpId){
      const v = bouState.ventes.find(v => v.id === currentEditOpId);
      if(v){ v.productId = prod.id; v.productName = prod.name; v.prixUnitaire = prod.price; v.quantite = qte; v.montant = montant; v.note = note; }
    }else{
      bouState.ventes.push({ id: uid(), productId: prod.id, productName: prod.name, prixUnitaire: prod.price, quantite: qte, montant, note, time });
    }
  }else{
    const montant = num(document.getElementById('bouOpMontant').value);
    if(montant <= 0){ alert('Indiquez un montant.'); return; }

    const list = currentBouOpType === 'retrait' ? bouState.retraits : bouState.depots;

    if(currentEditOpId){
      const v = list.find(v => v.id === currentEditOpId);
      if(v){ v.montant = montant; v.note = note; }
    }else{
      list.push({ id: uid(), montant, note, time });
    }
  }

  cancelEditBouOp();
  renderBouOpList();
  await persistBoutique();
}

function renderBouOpList(){
  const all = [
    ...bouState.retraits.map(v => ({ ...v, kind:'retrait' })),
    ...bouState.depots.map(v => ({ ...v, kind:'depot' })),
    ...bouState.ventes.map(v => ({ ...v, kind:'vente' }))
  ].sort((a,b) => (a.time||'').localeCompare(b.time||''));

  document.getElementById('bouOpCount').textContent = all.length ? `(${all.length})` : '';

  document.getElementById('bouOpList').innerHTML = all.slice().reverse().map(v => {
    const meta = BOU_OPTYPES.find(t => t.key === v.kind);
    let title = meta.label;
    let sub = v.time || '';

    if(v.kind === 'vente'){ title = v.productName; sub += ` · ${v.quantite} × ${fmt(v.prixUnitaire)} F`; }
    if(v.note) sub += ' · ' + escapeHtml(v.note);

    const sign = v.kind === 'retrait' ? '-' : '+';

    return `
      <div class="list-item">
        <span class="ic">${meta.ic}</span>
        <div class="info"><div class="t">${escapeHtml(title)}</div><div class="s">${sub}</div></div>
        <span class="amt">${sign}${fmt(v.montant)}</span>
        <button class="del" onclick="editBouOp('${v.kind}','${v.id}')" style="color:var(--amber)">✎</button>
        <button class="del" onclick="removeBouOp('${v.kind}','${v.id}')">✕</button>
      </div>
    `;
  }).join('') || '<div class="empty">Aucune opération enregistrée</div>';
}

function editBouOp(kind, id){
  const list = kind === 'retrait' ? bouState.retraits : kind === 'depot' ? bouState.depots : bouState.ventes;
  const v = list.find(v => v.id === id);
  if(!v) return;

  currentEditOpId = id;
  currentBouOpType = kind;
  renderBouOpGrid();
  renderBouOpFields();

  if(kind === 'vente'){
    document.getElementById('bouVenteProduit').value = v.productId;
    document.getElementById('bouVenteQte').value = v.quantite;
    updateBouVenteTotal();
  }else{
    document.getElementById('bouOpMontant').value = v.montant;
  }

  document.getElementById('bouOpNote').value = v.note || '';
  document.getElementById('bouAddOpBtn').textContent = '✓ Enregistrer la modification';
  document.getElementById('bouCancelOpEditBtn').classList.remove('hidden');
}

function cancelEditBouOp(){
  currentEditOpId = null;
  document.getElementById('bouOpNote').value = '';
  document.getElementById('bouAddOpBtn').textContent = '+ Ajouter cette opération';
  document.getElementById('bouCancelOpEditBtn').classList.add('hidden');
  renderBouOpFields();
}

async function removeBouOp(kind, id){
  if(kind === 'retrait') bouState.retraits = bouState.retraits.filter(v => v.id !== id);
  else if(kind === 'depot') bouState.depots = bouState.depots.filter(v => v.id !== id);
  else bouState.ventes = bouState.ventes.filter(v => v.id !== id);

  renderBouOpList();
  await persistBoutique();
}

function backToOpFromBoutiqueSituation(){
  renderBoutiqueService();
  showBouStage('service');
}

// ---------- Clôture ----------

function goToBoutiqueClosing(){
  document.getElementById('bouMontantCompte').value = bouState.montantCompte || '';
  showBouStage('cloture');
}

// ---------- Situation / calculs ----------

function bouShiftTotals(d){
  const totalRetraits = (d.retraits || []).reduce((s,v) => s + v.montant, 0);
  const totalDepots = (d.depots || []).reduce((s,v) => s + v.montant, 0);
  const totalVentes = (d.ventes || []).reduce((s,v) => s + v.montant, 0);
  const fondsCaisse = num(d.fondsCaisse);
  const attendu = fondsCaisse + totalDepots + totalVentes - totalRetraits;
  const montantCompte = num(d.montantCompte);

  return { totalRetraits, totalDepots, totalVentes, fondsCaisse, attendu, montantCompte, ecart: montantCompte - attendu };
}

function computeAndShowBoutiqueSituation(readOnly){
  document.getElementById('bouSituInfoBox').innerHTML = `
    <div class="summary-line"><span>Station</span><span class="v">${escapeHtml(bouState.stationName || '—')}</span></div>
    <div class="summary-line"><span>Hôtesse</span><span class="v">${escapeHtml(bouState.hotesseName || '—')}</span></div>
    <div class="summary-line"><span>Date</span><span class="v">${new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })}</span></div>
  `;

  const montantCompteInput = document.getElementById('bouMontantCompte');
  if(montantCompteInput && montantCompteInput.value !== '') bouState.montantCompte = montantCompteInput.value;

  const t = bouShiftTotals(bouState);

  document.getElementById('bouSumRetraits').innerHTML = bouState.retraits.map(v => `
    <div class="summary-line"><span>${v.time}${v.note ? ' · ' + escapeHtml(v.note) : ''}</span><span class="v">-${fmt(v.montant)}</span></div>
  `).join('') || '<div class="empty">Aucun retrait</div>';

  document.getElementById('bouSumDepots').innerHTML = bouState.depots.map(v => `
    <div class="summary-line"><span>${v.time}${v.note ? ' · ' + escapeHtml(v.note) : ''}</span><span class="v">+${fmt(v.montant)}</span></div>
  `).join('') || '<div class="empty">Aucun dépôt</div>';

  document.getElementById('bouSumVentes').innerHTML = bouState.ventes.map(v => `
    <div class="summary-line"><span>${escapeHtml(v.productName)} × ${v.quantite}</span><span class="v">+${fmt(v.montant)}</span></div>
  `).join('') || '<div class="empty">Aucune vente</div>';

  document.getElementById('bouSumFinal').innerHTML = `
    <div class="summary-line"><span>Fonds de caisse départ</span><span class="v">${fmt(t.fondsCaisse)} F</span></div>
    <div class="summary-line"><span>+ Dépôts</span><span class="v">${fmt(t.totalDepots)} F</span></div>
    <div class="summary-line"><span>+ Ventes produits</span><span class="v">${fmt(t.totalVentes)} F</span></div>
    <div class="summary-line"><span>− Retraits</span><span class="v">-${fmt(t.totalRetraits)} F</span></div>
    <div class="summary-line total"><span>Montant attendu en caisse</span><span class="v">${fmt(t.attendu)} F</span></div>
    <div class="summary-line total"><span>Montant compté</span><span class="v">${fmt(t.montantCompte)} F</span></div>
  `;

  const ok = t.ecart >= 0;
  document.getElementById('bouSituationBox').innerHTML = `
    <div class="situation-box ${ok ? 'ok' : 'bad'}">
      <div class="tag">${t.ecart === 0 ? 'Caisse juste' : (t.ecart < 0 ? 'Manquant' : 'Excédent')}</div>
      <div class="amount">${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)} F</div>
      <div class="hint">Compté (${fmt(t.montantCompte)}) − Attendu (${fmt(t.attendu)})</div>
    </div>
  `;

  document.getElementById('bouCloseShiftBtn').classList.toggle('hidden', !!readOnly);
  document.getElementById('bouBackToOpBtn').classList.toggle('hidden', !!readOnly);
  document.getElementById('bouBackToClotureBtn').classList.toggle('hidden', !!readOnly);

  if(readOnly){
    document.getElementById('bouSignaturePanel').classList.remove('hidden');
    document.getElementById('bouSignatureInput').style.display = 'none';
    const p = document.querySelector('#bouSignaturePanel p');
    if(p) p.classList.add('hidden');

    let confirmEl = document.getElementById('bouSignatureConfirmed');
    if(!confirmEl){
      confirmEl = document.createElement('div');
      confirmEl.id = 'bouSignatureConfirmed';
      confirmEl.style.cssText = 'font-size:14px;font-weight:700;color:var(--good);';
      document.getElementById('bouSignaturePanel').appendChild(confirmEl);
    }
    confirmEl.textContent = '✓ Signé par ' + escapeHtml(bouState.signature || '—');
  }else{
    document.getElementById('bouSignaturePanel').classList.remove('hidden');
    document.getElementById('bouSignatureInput').style.display = '';
    const p = document.querySelector('#bouSignaturePanel p');
    if(p) p.classList.remove('hidden');

    const confirmEl = document.getElementById('bouSignatureConfirmed');
    if(confirmEl) confirmEl.remove();

    document.getElementById('bouSignatureInput').value = bouState.signature || bouState.hotesseName || '';
  }

  showBouStage('situation');
  window._lastBouSituation = t;
}

function shareBoutiqueWhatsApp(){
  const s = window._lastBouSituation;
  if(!s) return;

  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  let msg = `*Situation boutique du ${dateStr}*\n`;
  if(bouState.stationName) msg += `Station : ${bouState.stationName}\n`;
  if(bouState.hotesseName) msg += `Hôtesse : ${bouState.hotesseName}\n\n`;
  msg += `Fonds de caisse départ : ${fmt(s.fondsCaisse)} F\n`;
  msg += `Dépôts : +${fmt(s.totalDepots)} F\n`;
  msg += `Ventes produits : +${fmt(s.totalVentes)} F\n`;
  msg += `Retraits : -${fmt(s.totalRetraits)} F\n`;
  msg += `Attendu en caisse : ${fmt(s.attendu)} F\n`;
  msg += `Compté : ${fmt(s.montantCompte)} F\n`;
  msg += `Écart : ${s.ecart > 0 ? '+' : ''}${fmt(s.ecart)} F ${s.ecart < 0 ? '(manquant)' : (s.ecart > 0 ? '(excédent)' : '(caisse juste)')}\n`;
  msg += `\n_Signé par ${bouState.signature || bouState.hotesseName || '—'}_`;

  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

async function closeBoutiqueShift(){
  const sig = document.getElementById('bouSignatureInput').value.trim();

  if(!sig){
    document.getElementById('bouSignatureMsg').textContent = 'Veuillez taper votre nom pour signer avant de clôturer.';
    document.getElementById('bouSignatureMsg').style.color = 'var(--bad)';
    document.getElementById('bouSignatureInput').focus();
    return;
  }

  bouState.signature = sig;
  bouState.status = 'closed';
  bouState.closedAt = new Date().toISOString();

  const ok = await persistBoutique();
  const msg = document.getElementById('bouStatusMsg');

  if(ok){
    msg.textContent = '✓ Boutique clôturée et archivée';
    updateBouStatusHeader();
    document.getElementById('bouCloseShiftBtn').classList.add('hidden');
    document.getElementById('bouBackToOpBtn').classList.add('hidden');
    document.getElementById('bouBackToClotureBtn').classList.add('hidden');
  }else{
    msg.textContent = "Échec de l'enregistrement — réessayez.";
  }
}

// ---------- Historique ----------

async function loadBoutiqueHistory(){
  try{
    const { data, error } = await sb.from('shifts').select('shift_date,data').eq('user_id', currentUser.id).order('shift_date', { ascending:false }).limit(90);
    if(error) throw error;

    bouHistoryCache = (data || []).filter(r => r.data && r.data.status === 'closed' && Object.prototype.hasOwnProperty.call(r.data, 'fondsCaisse'));
  }catch(e){
    console.warn('Historique indisponible :', e.message);
    bouHistoryCache = [];
  }

  renderBoutiqueHistory();
}

function renderBoutiqueHistory(){
  const now = new Date();
  const ym = now.toISOString().slice(0,7);

  document.getElementById('bouMonthTitle').textContent = 'Récapitulatif — ' + now.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });

  const monthRows = bouHistoryCache.filter(r => r.shift_date.startsWith(ym));

  let monthVentes = 0, monthDepots = 0, monthRetraits = 0, monthEcart = 0;
  monthRows.forEach(r => {
    const t = bouShiftTotals(r.data);
    monthVentes += t.totalVentes;
    monthDepots += t.totalDepots;
    monthRetraits += t.totalRetraits;
    monthEcart += t.ecart;
  });

  document.getElementById('bouMonthRecap').innerHTML = monthRows.length ? `
    <div class="summary-line"><span>Jours travaillés</span><span class="v">${monthRows.length}</span></div>
    <div class="summary-line"><span>Total ventes produits</span><span class="v">${fmt(monthVentes)} F</span></div>
    <div class="summary-line"><span>Total dépôts</span><span class="v">${fmt(monthDepots)} F</span></div>
    <div class="summary-line"><span>Total retraits</span><span class="v">${fmt(monthRetraits)} F</span></div>
    <div class="summary-line total"><span>Écart cumulé</span><span class="v" style="color:${monthEcart < 0 ? 'var(--bad)' : 'var(--good)'}">${monthEcart > 0 ? '+' : ''}${fmt(monthEcart)} F</span></div>
  ` : '<div class="empty">Aucune journée clôturée ce mois-ci</div>';

  document.getElementById('bouHistList').innerHTML = bouHistoryCache.map(r => {
    const t = bouShiftTotals(r.data);
    const d = new Date(r.shift_date + 'T00:00:00');

    return `
      <div class="hist-item" onclick="openBoutiqueHistoryDetail('${r.shift_date}')">
        <div class="hd">
          <div class="date">${d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}</div>
          <div class="sub">Ventes ${fmt(t.totalVentes)} F · Compté ${fmt(t.montantCompte)} F</div>
        </div>
        <div class="he ${t.ecart < 0 ? 'bad' : 'good'}">${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)}</div>
      </div>
    `;
  }).join('') || '<div class="empty">Aucune journée archivée pour l\u2019instant</div>';
}

function openBoutiqueHistoryDetail(dateStr){
  const row = bouHistoryCache.find(r => r.shift_date === dateStr);
  if(!row) return;

  const d = row.data;
  const t = bouShiftTotals(d);
  const dObj = new Date(dateStr + 'T00:00:00');
  const ok = t.ecart >= 0;

  document.getElementById('bouDetailInfoBox').innerHTML = `
    <div class="summary-line"><span>Station</span><span class="v">${escapeHtml(d.stationName || '—')}</span></div>
    <div class="summary-line"><span>Hôtesse</span><span class="v">${escapeHtml(d.hotesseName || '—')}</span></div>
    <div class="summary-line"><span>Signé par</span><span class="v" style="color:var(--good)">${escapeHtml(d.signature || '—')}</span></div>
  `;

  document.getElementById('bouDetailBox').innerHTML = `
    <div class="situation-box ${ok ? 'ok' : 'bad'}">
      <div class="tag">${dObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
      <div class="amount">${t.ecart > 0 ? '+' : ''}${fmt(t.ecart)} F</div>
      <div class="hint">Compté (${fmt(t.montantCompte)}) − Attendu (${fmt(t.attendu)})</div>
    </div>
  `;

  document.getElementById('bouDetailRetraits').innerHTML = (d.retraits || []).map(v => `
    <div class="summary-line"><span>${v.time}${v.note ? ' · ' + escapeHtml(v.note) : ''}</span><span class="v">-${fmt(v.montant)}</span></div>
  `).join('') || '<div class="empty">Aucun retrait</div>';

  document.getElementById('bouDetailDepots').innerHTML = (d.depots || []).map(v => `
    <div class="summary-line"><span>${v.time}${v.note ? ' · ' + escapeHtml(v.note) : ''}</span><span class="v">+${fmt(v.montant)}</span></div>
  `).join('') || '<div class="empty">Aucun dépôt</div>';

  document.getElementById('bouDetailVentes').innerHTML = (d.ventes || []).map(v => `
    <div class="summary-line"><span>${escapeHtml(v.productName)} × ${v.quantite}</span><span class="v">+${fmt(v.montant)}</span></div>
  `).join('') || '<div class="empty">Aucune vente</div>';

  document.getElementById('bouDetailFinal').innerHTML = `
    <div class="summary-line"><span>Fonds de caisse départ</span><span class="v">${fmt(t.fondsCaisse)} F</span></div>
    <div class="summary-line total"><span>Attendu en caisse</span><span class="v">${fmt(t.attendu)} F</span></div>
    <div class="summary-line total"><span>Compté</span><span class="v">${fmt(t.montantCompte)} F</span></div>
  `;

  showBouStage('detail');
}
