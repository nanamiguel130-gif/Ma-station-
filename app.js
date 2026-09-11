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
    fuels: [
      { id: uid(), type:'super',   opening:'', closing:'', price:0 },
      { id: uid(), type:'gazole',  opening:'', closing:'', price:0 },
      { id: uid(), type:'petrole', opening:'', closing:'', price:0 }
    ],
    gaz: {
      '6kg':  { label:'Gaz 6 kg',  opening:0, recharge:0, consigne:0, price:0 },
      '12kg': { label:'Gaz 12 kg', opening:0, recharge:0, consigne:0, price:0 },
      '35kg': { label:'Gaz 35 kg', opening:0, recharge:0, consigne:0, price:0 }
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
  const price = num(fuel.price);
  const qty = Math.max(0, closing - opening);
  return { qty, montant: qty * price };
}

function calculateGazSale(gaz){
  const recharge = num(gaz.recharge);
  const consigne = num(gaz.consigne);
  const price = num(gaz.price);
  return { recharge, consigne, montant: (recharge + consigne) * price };
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
  Object.values(d.gaz || {}).forEach(gaz => {
    const sale = calculateGazSale(gaz);
    gazSales.push({ label: gaz.label, recharges: sale.recharge, consignes: sale.consigne, montant: sale.montant });
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

  routePompisteStage();
}

function mergePompisteState(base, saved){
  const result = { ...base, ...saved };
  result.fuels = saved.fuels !== undefined ? normalizeFuels(saved.fuels) : base.fuels;
  result.gaz = { ...base.gaz, ...(saved.gaz || {}) };
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

  try{
    await sb.from('profiles').upsert({
      id: currentUser.id, full_name: name, email: prof
