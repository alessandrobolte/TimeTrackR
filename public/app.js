// app.js — Hauptlogik der Zeiterfassungs-App (deutsch)
// Läuft komplett im Browser, kommuniziert mit Cloudflare Worker-Backend (API)

let state = {
  user: null,
  data: null,
  ui: { theme: 'light' }
};

// Element-Setter
function setHTML(html) {
  document.getElementById('app').innerHTML = html;
}

// Hauptansichten ---------------------------------------------------------------

function createLoginView() {
  return `
  <div class="login-wrapper">
    <h2>Zeiterfassung</h2>
    <div class="form-row">
      <label>Benutzername</label>
      <input id="loginUser" type="text" autocomplete="username" placeholder="z. B. mmustermann" />
    </div>
    <div class="form-row">
      <label>Passwort</label>
      <input id="loginPass" type="password" autocomplete="current-password" placeholder="••••••••" />
    </div>
    <div class="form-row">
      <button id="loginBtn" class="accent full">Anmelden</button>
    </div>
    <div id="loginMsg" class="msg"></div>
  </div>
  `;
}

function createUserView(user) {
  return `
  <header class="main-header">
    <div>👤 ${user.displayName} (${user.username})</div>
    <div class="flex-gap">
      <button id="settingsBtn">⚙️</button>
      <button id="logoutBtn">Abmelden</button>
    </div>
  </header>
  <main id="userMain" class="content">
    <section id="activeSession" class="card">
      <h3>Aktive Zeiterfassung</h3>
      <div id="activeTimerDisplay" class="timer-display">--:--:--</div>
      <div class="flex-gap">
        <select id="categorySelect"></select>
        <button id="startBtn" class="accent">Start</button>
        <button id="stopBtn">Stopp</button>
      </div>
    </section>

    <section id="sessionsSection" class="card">
      <h3>Letzte Sitzungen</h3>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button id="manualAddBtn">Manuell hinzufügen</button>
        <button id="exportBtn">CSV exportieren</button>
      </div>
      <table id="sessionsTable" class="data-table">
        <thead>
          <tr><th>Datum</th><th>Kategorie</th><th>Dauer</th><th>Notiz</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </section>

    <section id="categoriesSection" class="card">
      <h3>Kategorien</h3>
      <div id="categoryList"></div>
    </section>
  </main>
  `;
}

function createAdminView(user) {
  return `
  <header class="main-header">
    <div>🛡️ Admin: ${user.displayName} (${user.username})</div>
    <div class="flex-gap">
      <button id="logoutBtn">Abmelden</button>
    </div>
  </header>
  <main class="content">
    <section class="card">
      <h3>Projekt: LemGOesHANA</h3>
      <div id="adminLemList"></div>
      <button id="adminExportBtn" class="accent" style="margin-top:8px">CSV exportieren</button>
    </section>
  </main>
  `;
}

// Initialisierung -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Dark/Light Theme
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;

  // Standard-View: Login
  setHTML(createLoginView());

  document.getElementById('loginBtn').onclick = async () => {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();
    const msg = document.getElementById('loginMsg');
    msg.textContent = '';
    if (!username || !password) {
      msg.textContent = 'Bitte Benutzername und Passwort eingeben.';
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username, password}),
      });
      if (!res.ok) throw new Error(await res.text());
      const js = await res.json();
      state.user = js;
      if (js.mustChangePassword) {
        setHTML(createChangePasswordView(js));
        return;
      }
      if (js.role === 'admin') {
        setHTML(createAdminView(js));
        await loadAdminData();
      } else {
        setHTML(createUserView(js));
        await loadUserData();
      }
    } catch (e) {
      msg.textContent = 'Anmeldung fehlgeschlagen: ' + e.message;
    }
  };
});

// Passwortänderungs-Ansicht ---------------------------------------------------

function createChangePasswordView(user) {
  return `
  <div class="login-wrapper">
    <h2>Passwort ändern</h2>
    <p>Hallo ${user.displayName}, bitte lege ein neues Passwort fest.</p>
    <div class="form-row"><input id="newPass" type="password" placeholder="Neues Passwort" /></div>
    <div class="form-row"><input id="newPass2" type="password" placeholder="Wiederholen" /></div>
    <div class="form-row"><button id="pwSaveBtn" class="accent full">Speichern</button></div>
    <div id="pwMsg" class="msg"></div>
  </div>
  `;
}

// Passwortänderung speichern
async function saveNewPassword() {
  const pass1 = document.getElementById('newPass').value.trim();
  const pass2 = document.getElementById('newPass2').value.trim();
  const msg = document.getElementById('pwMsg');
  msg.textContent = '';
  if (pass1.length < 4) {
    msg.textContent = 'Passwort zu kurz.';
    return;
  }
  if (pass1 !== pass2) {
    msg.textContent = 'Passwörter stimmen nicht überein.';
    return;
  }

  try {
    const res = await fetch('/api/changePassword', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({password: pass1}),
    });
    if (!res.ok) throw new Error(await res.text());
    const js = await res.json();
    if (js.role === 'admin') {
      setHTML(createAdminView(js));
      await loadAdminData();
    } else {
      setHTML(createUserView(js));
      await loadUserData();
    }
  } catch (e) {
    msg.textContent = 'Fehler: ' + e.message;
  }
}

// Logout
async function logout() {
  try { await fetch('/api/logout', {method: 'POST'}); } catch {}
  location.reload();
}

// Benutzer-Ansicht laden
async function loadUserData() {
  try {
    const res = await fetch('/api/loadData');
    if (!res.ok) throw new Error('Serverfehler');
    const js = await res.json();
    state.data = js;
    fillCategories();
    renderSessions();
    document.getElementById('startBtn').onclick = startLocalTimer;
    document.getElementById('stopBtn').onclick = stopLocalTimer;
    document.getElementById('manualAddBtn').onclick = openManualModal;
    document.getElementById('exportBtn').onclick = exportCsv;
    document.getElementById('logoutBtn').onclick = logout;
  } catch (e) {
    alert('Fehler beim Laden der Daten: ' + e.message);
  }
}

// Kategorien befüllen
function fillCategories() {
  const sel = document.getElementById('categorySelect');
  sel.innerHTML = '';
  if (!state.data || !state.data.categories) return;
  for (const c of state.data.categories) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }
}

// Timer starten
function startLocalTimer() {
  if (!state.data) return;
  if (state.data.active) {
    alert('Ein Timer läuft bereits.');
    return;
  }
  const catId = document.getElementById('categorySelect').value;
  const cat = state.data.categories.find(c => c.id === catId);
  if (!cat) {
    alert('Kategorie nicht gefunden.');
    return;
  }
  const start = Date.now();
  state.data.active = {categoryId: cat.id, start};
  const c = cat;
  c.sessions = c.sessions || [];
  c.sessions.push({
    id: Math.random().toString(36).slice(2, 9),
    start,
    end: null,
    durationMin: null
  });
  saveClientData();
}

// Fortsetzung von app.js — ab dem Punkt, an dem die Session angelegt wurde

c.sessions.push({id:Math.random().toString(36).slice(2,9),start,end:null,durationMin:null});
// persistieren
saveClientData();
}

function stopLocalTimer(){
  if(!state.data || !state.data.active){ alert('Kein laufender Timer.'); return; }
  const a = state.data.active;
  const end = Date.now();
  const c = state.data.categories.find(x=> x.id === a.categoryId);
  if(!c) return;

  // finde zuletzt offene Session
  const session = (c.sessions||[]).slice().reverse().find(s => !s.end && (s.start === a.start || s.start <= a.start));
  if(session){
    session.end = end;
    session.durationMin = Math.max(1, Math.round((session.end - session.start)/60000));
    // Modal für Notiz
    const modal = openModal(`<h3>Session-Notiz hinzufügen</h3>
      <div style="margin-top:8px">
        <textarea id="noteText" rows="3" style="width:100%;border-radius:8px;padding:6px;border:1px solid var(--muted);" placeholder="Kurze Beschreibung dieser Session..."></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button id="saveNote" class="accent small">Speichern</button>
        <button id="skipNote" class="small">Überspringen</button>
      </div>
    `);
    const ta = modal.querySelector('#noteText'); setTimeout(()=>ta.focus(),50);
    modal.querySelector('#saveNote').onclick = ()=>{ session.note = ta.value.trim(); closeModal(); finishStop(); };
    modal.querySelector('#skipNote').onclick = ()=>{ closeModal(); finishStop(); };
  } else {
    finishStop();
  }

  function finishStop(){
    state.data.active = null;
    saveClientData();
    renderSessions();
  }
}

// Speichert Client-Daten beim Server
async function saveClientData(){
  try{
    await fetch('/api/saveData',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.data)});
  }catch(e){ console.warn('Speichern fehlgeschlagen:', e); }
}

// Anzeige aktueller Timer
setInterval(()=>{
  const el = document.getElementById('activeTimerDisplay');
  if(!el) return;
  if(state.data && state.data.active){
    const secs = Math.floor((Date.now() - state.data.active.start)/1000);
    el.textContent = msToHms(secs*1000);
  } else el.textContent = '--:--:--';
},500);

function msToHms(ms){ if(!isFinite(ms)) return '--:--:--'; const secs = Math.floor(ms/1000); const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }

// Manuelles Nachtragen
function openManualModal(){
  const cats = (state.data && state.data.categories || []).map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const modal = openModal(`<h3>Manuelles Nachtragen</h3>
    <div class="form-row"><label>Kategorie</label><select id="mcat">${cats}</select></div>
    <div class="form-row"><label>Datum</label><input id="mdate" type="date"/></div>
    <div class="form-row"><label>Dauer</label><input id="mhours" type="number" min="0" placeholder="Stunden"/> <input id="mmins" type="number" min="0" max="59" placeholder="Minuten"/></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button id="madd" class="accent">Hinzufügen</button><button id="mclose" class="small">Abbrechen</button></div>
  `);
  modal.querySelector('#mclose').onclick = ()=> closeModal();
  modal.querySelector('#madd').onclick = ()=>{
    const catId = modal.querySelector('#mcat').value; const date = modal.querySelector('#mdate').value;
    const hours = parseInt(modal.querySelector('#mhours').value||'0',10); const mins = parseInt(modal.querySelector('#mmins').value||'0',10);
    if(!catId || !date || (hours===0 && mins===0)){ alert('Bitte Kategorie, Datum und Dauer angeben.'); return; }
    const start = new Date(date+'T00:00:00').getTime(); const durationMin = hours*60 + mins; const end = start + durationMin*60000;
    const cat = state.data.categories.find(c=>c.id===catId); cat.sessions = cat.sessions || []; cat.sessions.push({id:Math.random().toString(36).slice(2,9), start, end, durationMin, note: ''});
    saveClientData(); closeModal(); renderSessions();
  };
}

// Export CSV
async function exportCsv(){
  try{
    const res = await fetch('/api/export');
    if(!res.ok){ alert('Export fehlgeschlagen'); return; }
    const txt = await res.text();
    const blob = new Blob([txt],{type:'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='zeitmanagement_export.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }catch(e){ console.error(e); alert('Fehler beim Export'); }
}

// Sessions Tabelle rendern
function renderSessions(){
  const tbody = document.querySelector('#sessionsTable tbody'); if(!tbody) return;
  const rows = [];
  state.data.categories.forEach(c=>{ (c.sessions||[]).forEach(s=>{ if(!s.start) return; const dur = s.durationMin || (s.end? Math.round((s.end-s.start)/60000):0); rows.push({date:new Date(s.start), cat:c.name, dur, note: s.note||'', cid: c.id, sid: s.id}); }); });
  rows.sort((a,b)=> b.date - a.date);
  tbody.innerHTML = rows.map(r=>`<tr data-cid="${r.cid}" data-sid="${r.sid}"><td>${r.date.toLocaleString()}</td><td>${escapeHtml(r.cat)}</td><td>${minutesToHuman(r.dur)}</td><td contenteditable="true">${escapeHtml(r.note)}</td></tr>`).join('');
  // save note on blur
  tbody.querySelectorAll('td[contenteditable]').forEach(td=> td.addEventListener('blur', e=>{
    const tr = td.closest('tr'); const cid = tr.dataset.cid; const sid = tr.dataset.sid; const cat = state.data.categories.find(x=>x.id===cid); if(!cat) return; const sess = (cat.sessions||[]).find(s=>s.id===sid); if(!sess) return; sess.note = td.textContent.trim(); saveClientData();
  }));
}

function minutesToHuman(min){ const h = Math.floor(min/60); const m = Math.round(min%60); return `${h}h ${m}m`; }

function escapeHtml(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Category Details modal
function showCategoryDetails(id){
  const c = state.data.categories.find(x=>x.id===id); if(!c) return;
  const rows = (c.sessions||[]).slice().reverse().map(s=>`<tr><td>${new Date(s.start).toLocaleString()}</td><td>${s.end?new Date(s.end).toLocaleString():'—'}</td><td>${minutesToHuman(s.durationMin|| (s.end?Math.round((s.end-s.start)/60000):0)||0)}</td><td contenteditable="true" data-sid="${s.id}">${escapeHtml(s.note||'')}</td></tr>`).join('');
  const modal = openModal(`<h3>Details — ${escapeHtml(c.name)}</h3>
    <div style="max-height:320px;overflow:auto;margin-top:8px">
      <table style='width:100%'>
        <thead><tr><th>Start</th><th>Ende</th><th>Dauer</th><th>Notiz</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="font-size:0.8rem;color:var(--muted);margin-top:6px;">Klicke in eine Notiz-Zelle, um Text zu ändern. Änderungen werden automatisch gespeichert.</div>
    </div>`);
  modal.querySelectorAll('td[contenteditable]').forEach(td=> td.addEventListener('blur', e=>{
    const sid = td.dataset.sid; const sess = c.sessions.find(s=>s.id===sid); if(sess){ sess.note = td.textContent.trim(); saveClientData(); }
  }));
}

function openModal(innerHTML){
  closeModal();
  const modalRoot = document.getElementById('modalRoot') || (function(){ const d = document.createElement('div'); d.id='modalRoot'; document.body.appendChild(d); return d; })();
  const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
  const modal = document.createElement('div'); modal.className='modal';
  modal.innerHTML = innerHTML + `<div style="text-align:right;margin-top:8px"><button id="closeModal" class="small">Schließen</button></div>`;
  backdrop.appendChild(modal); modalRoot.appendChild(backdrop);
  backdrop.querySelector('#closeModal').onclick = ()=> closeModal();
  return modal;
}
function closeModal(){ const root = document.getElementById('modalRoot'); if(root) root.innerHTML=''; }

// Admin Dashboard loader
async function loadAdminData(){
  try{
    const js = await api('admin/lemgo'); // erwartet: [{displayName, sessions: [...]}, ...]
    const el = document.getElementById('adminLemList'); if(!el) return;
    el.innerHTML = js.map(u=>`<div style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06)"><strong>${escapeHtml(u.displayName)}</strong><div style="font-size:0.9rem;color:var(--muted)">${u.sessions.map(s=>`<div>${new Date(s.start).toLocaleString()} — ${minutesToHuman(s.durationMin||0)} — ${escapeHtml(s.note||'')}</div>`).join('')}</div></div>`).join('');
    const exp = document.getElementById('adminExportBtn'); if(exp) exp.onclick = exportCsv;
  }catch(e){ console.error(e); alert('Admin-Daten konnten nicht geladen werden'); }
}

// helper: einfache API wrapper
async function api(path, opts={}){
  opts.headers = opts.headers || {};
  opts.credentials = 'include';
  const res = await fetch(`/api/${path}`, opts);
  if(res.status === 401) throw new Error('unauthorized');
  return res.json();
}

// Initial check: wer ist angemeldet?
(async function init(){
  try{ const res = await fetch('/api/whoami'); if(res.ok){ const js = await res.json(); if(js && js.username){ state.user = js; if(js.role==='admin'){ setHTML(createAdminView(js)); await loadAdminData(); } else { setHTML(createUserView(js)); await loadUserData(); } return; } } }
  catch(e){ console.warn('whoami fehlgeschlagen', e); }
  // falls nicht angemeldet — login bereits im DOM
})();

// simple CSV escape (falls benötigt clientseitig)
function escapeCsv(t){ if(t==null) return ''; const s=String(t); if(s.includes(',')||s.includes('"')||s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"'; return s; }

