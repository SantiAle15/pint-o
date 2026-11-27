// Inicio de sesión con Google + sincronización con Firebase (Firestore).
// Tu configuración va aquí. Estos datos NO son secretos; lo que protege tu información
// son las reglas de Firestore (cada persona solo accede a lo suyo).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCcyzCKqHUgzpltJ77TQFX4SJfH1qQ0vIE",
  authDomain: "pint-o.firebaseapp.com",
  projectId: "pint-o",
  storageBucket: "pint-o.firebasestorage.app",
  messagingSenderId: "298292503511",
  appId: "1:298292503511:web:23ba19c9f58c898d3d2192"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Qué se sincroniza: todo lo de la app, MENOS la API key, fotos en caché, clima y los datos de sync.
function sincronizable(k){
  if(!(k.startsWith('hydro-') || k.startsWith('torre-'))) return false;
  return !(k === 'hydro-apikey' || k === 'hydro-ip' || k.startsWith('torre-foto-') ||
           k.startsWith('torre-clima') || k.startsWith('hydro-sync-'));
}
function leerLocal(){
  const d = {};
  try{ for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(sincronizable(k)) d[k] = localStorage.getItem(k); } }catch(e){}
  return d;
}
function aplicarRemoto(data, ts){
  try{
    Object.keys(leerLocal()).forEach(k => { if(!(k in data)) localStorage.removeItem(k); });
    Object.keys(data).forEach(k => { if(sincronizable(k)) localStorage.setItem(k, data[k]); });
    localStorage.setItem('hydro-sync-ts', String(ts));
  }catch(e){}
}
const tsLocal = () => Number(localStorage.getItem('hydro-sync-ts') || 0);

let user = null, ref = null, unsub = null, temporizador = null, estado = 'Sin conectar', aplicando = false;

function pintar(){
  const b = $('cuentaBody'); if(!b) return;
  if(!user){
    b.innerHTML = `<p class="note" style="margin-top:0;">Entra con tu cuenta de Google y tus huecos, siembras y bitácora se guardan en la nube y aparecen en tu celular y tu laptop.</p>
      <button class="btn" id="btnEntrar">Entrar con Google</button>
      <p class="aviso" id="cuentaMsg">${esc(estado === 'Sin conectar' ? '' : estado)}</p>`;
    $('btnEntrar').onclick = entrar;
  } else {
    b.innerHTML = `<div class="next" style="padding-top:0;"><div class="em">${user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" referrerpolicy="no-referrer">` : '🙂'}</div>
        <div class="n">${esc(user.displayName || 'Tu cuenta')}<small>${esc(user.email || '')}</small></div></div>
      <p class="aviso" id="cuentaMsg"><b>${esc(estado)}</b></p>
      <button class="btn small" id="btnAhora">Sincronizar ahora</button>
      <button class="btn small ghost" id="btnSalir">Cerrar sesión</button>
      <p class="note">Tu API key de Anthropic nunca se sube; se queda en cada dispositivo.</p>`;
    $('btnAhora').onclick = () => subir(true);
    $('btnSalir').onclick = salir;
  }
}
function estadoSet(t){ estado = t; const m = $('cuentaMsg'); if(m) m.innerHTML = user ? `<b>${esc(t)}</b>` : esc(t); }

async function entrar(){
  estadoSet('Abriendo Google…');
  const prov = new GoogleAuthProvider();
  try{ await signInWithPopup(auth, prov); }
  catch(e){
    if(e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')){
      try{ await signInWithRedirect(auth, prov); return; }catch(e2){ e = e2; }
    }
    const msg = e && e.code === 'auth/unauthorized-domain' ? 'Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).'
      : e && e.code === 'auth/popup-closed-by-user' ? 'Cerraste la ventana de Google.'
      : 'No se pudo iniciar sesión (' + ((e && e.code) || 'error') + ').';
    estadoSet(msg);
  }
}
async function salir(){ if(unsub){ unsub(); unsub = null; } await signOut(auth); }

async function subir(forzar){
  if(!user || !ref) return;
  const ts = Date.now();
  try{
    estadoSet('Guardando en la nube…');
    aplicando = true;
    await setDoc(ref, { data: leerLocal(), ts });
    localStorage.setItem('hydro-sync-ts', String(ts));
    estadoSet('Sincronizado · ' + new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }));
  }catch(e){ estadoSet('No se pudo guardar (' + ((e && e.code) || 'sin conexión') + '). Reintenta con internet.'); }
  finally{ aplicando = false; }
}
// la app avisa cada vez que cambias algo: esperamos un momento y subimos todo junto
window.__torreCambio = k => {
  if(!user || !sincronizable(k)) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => subir(), 1500);
};

async function iniciarSync(){
  ref = doc(db, 'usuarios', user.uid, 'datos', 'torre');
  estadoSet('Conectando…');
  let snap;
  try{ snap = await getDoc(ref); }catch(e){ estadoSet('No se pudo leer la nube (' + ((e && e.code) || 'sin conexión') + ').'); return; }
  const hayLocal = Object.keys(leerLocal()).length > 0;
  if(!snap.exists()){
    await subir();                                   // primera vez: subimos lo de este dispositivo
  } else {
    const r = snap.data();
    if(tsLocal() === 0 && hayLocal && JSON.stringify(r.data) !== JSON.stringify(leerLocal())){
      // este dispositivo tiene datos propios que nunca se sincronizaron y la nube también: preguntamos
      window.confirmar('En la nube ya hay datos de tu torre y este dispositivo también tiene los suyos. ¿Cuáles conservar? (Los otros se reemplazan.)',
        () => { aplicarRemoto(r.data || {}, r.ts || Date.now()); location.reload(); }, 'Usar los de la nube');
      const bn = document.querySelector('#sheetBody .btn.ghost');
      if(bn){ bn.textContent = 'Usar los de este dispositivo'; bn.onclick = () => { window.cerrarSlot(); subir(true); }; }
    } else if((r.ts || 0) > tsLocal()){
      aplicarRemoto(r.data || {}, r.ts); location.reload(); return;
    } else if(tsLocal() > (r.ts || 0)){ await subir(); }
    else estadoSet('Sincronizado');
  }
  // cambios que vengan de otro dispositivo
  unsub = onSnapshot(ref, s => {
    if(aplicando || !s.exists()) return;
    const r = s.data();
    if((r.ts || 0) > tsLocal()){ aplicarRemoto(r.data || {}, r.ts); location.reload(); }
  }, () => {});
}

onAuthStateChanged(auth, u => {
  user = u; pintar();
  if(u) iniciarSync(); else { ref = null; estado = 'Sin conectar'; }
});
pintar();
