/* global window, document, SB, localStorage, fetch */
(function(){
  'use strict';

  // ---- helpers ---------------------------------------------------
  const PID = 'octoprint';

  function getAllSettings(){
    const all = (SB.settings || {});
    if (!all[PID]) all[PID] = { instances: [] };
    if (!Array.isArray(all[PID].instances)) all[PID].instances = [];
    return all;
  }
  function getS(){ return getAllSettings()[PID]; }
  function saveS(next){
    const all = getAllSettings();
    all[PID] = next;
    SB.settings = all;
    try { localStorage.setItem('sb:settings', JSON.stringify(all)); } catch(_){}
    try { SB.plugins.get(PID)?.onSettings?.(next); } catch(_){}
  }
  function toast(text){ try { window.postMessage({ type:'sb:native:toast', text }, '*'); } catch(_) {} }

  // Simple id
  function uid(){ return 'o_' + Math.random().toString(36).slice(2,10); }

  // Modal builder (self-contained)
  function showModal({ title, body, primaryText='Save', onPrimary, secondaryText='Cancel', onSecondary }){
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal-card" style="max-width:560px">
        <div class="modal-title"><span>${title}</span></div>
        <div class="modal-body" style="padding:12px"></div>
        <div class="modal-footer">
          <button class="btn" data-act="secondary">${secondaryText}</button>
          <button class="btn primary" data-act="primary">${primaryText}</button>
        </div>
      </div>`;
    wrap.querySelector('.modal-body').appendChild(body);
    function close(){ document.body.removeChild(wrap); }
    wrap.addEventListener('click', (e)=>{ if (e.target === wrap) close(); });
    wrap.querySelector('[data-act="secondary"]').addEventListener('click', ()=>{
      try { onSecondary && onSecondary(); } finally { close(); }
    });
    wrap.querySelector('[data-act="primary"]').addEventListener('click', async ()=>{
      const ok = (onPrimary ? await onPrimary() : true);
      if (ok !== false) close();
    });
    document.body.appendChild(wrap);
  }

  // Instance editor form
  function buildInstanceForm(model){
    const root = document.createElement('div');
    root.className = 'card';
    root.innerHTML = `
      <label>Name <input id="op-name" value="${model.name||''}" placeholder="Office MK3S"/></label>
      <label>Base URL <input id="op-url" value="${model.url||''}" placeholder="https://printer.local"/></label>
      <label>API Key <input id="op-key" value="${model.key||''}" placeholder="••••••••"/></label>
      <label>Default?
        <select id="op-default">
          <option value="no"${model.default?'':' selected'}>No</option>
          <option value="yes"${model.default?' selected':''}>Yes</option>
        </select>
      </label>`;
    return {
      el: root,
      read: () => ({
        id: model.id || uid(),
        name: root.querySelector('#op-name').value.trim(),
        url:  root.querySelector('#op-url').value.trim(),
        key:  root.querySelector('#op-key').value.trim(),
        default: root.querySelector('#op-default').value === 'yes'
      })
    };
  }

  // Picker modal for Send to…
  function showPicker(instances, onPick){
    const body = document.createElement('div');
    const list = document.createElement('div');
    instances.forEach(i=>{
      const row = document.createElement('div');
      row.className = 'machine-row';
      row.innerHTML = `<div><strong>${i.name||i.url}</strong><div style="opacity:.7">${i.url}</div></div>
                       <button class="btn primary" data-id="${i.id}">Send</button>`;
      list.appendChild(row);
    });
    body.appendChild(list);
    showModal({
      title: 'Send to OctoPrint',
      body,
      primaryText: 'Close',
      onPrimary(){},
      secondaryText: 'Cancel',
      onSecondary(){},
    });
    list.addEventListener('click', (e)=>{
      const id = e.target?.getAttribute?.('data-id');
      if (!id) return;
      const inst = instances.find(x=>x.id===id);
      if (inst) onPick(inst);
    });
  }

  // Dummy send (wire real HTTP later)
  async function sendGCode(instance, data){
    // data = { gcode:String } or whatever your slicer passes via events
    console.log('[octoprint] would send to', instance, data);
    toast(`(Demo) Sent to ${instance.name||instance.url}`);
  }

  // ---- plugin registration --------------------------------------
  SB.register({
    id: PID,
    name: 'OctoPrint',
    builtIn: false,        // marketplace or user plugin

    // optional: expose a schema to appear under a dedicated tab
    schema: {
      title: 'OctoPrint',
      fields: [] // we’ll render a richer custom panel below instead
    },

    // Settings tab content (custom builder)
    buildSettingsPanel(ctx){
      // ctx: { settings, save(next) }
      const s = getS();
      const wrap = document.createElement('div');

      const sec = document.createElement('div'); sec.className = 'section';
      const card = document.createElement('div'); card.className = 'card';
      const list = document.createElement('div'); list.id = 'op-list';
      const add  = document.createElement('button'); add.className = 'btn primary'; add.textContent = 'Add Instance';
      card.appendChild(list); card.appendChild(add);
      sec.appendChild(card); wrap.appendChild(sec);

      function render(){
        const cur = getS().instances;
        list.innerHTML = '';
        if (!cur.length){
          const empty = document.createElement('div');
          empty.style.opacity = '.7';
          empty.textContent = 'No instances yet.';
          list.appendChild(empty);
        }
        cur.forEach((m, idx)=>{
          const row = document.createElement('div');
          row.className = 'machine-row';
          row.innerHTML = `
            <div>
              <strong>${m.name || '(unnamed)'}</strong>
              <span style="opacity:.7;margin-left:6px">${m.url||''}</span>
              ${m.default?'<span style="margin-left:8px;opacity:.7">(default)</span>':''}
            </div>
            <div>
              <button class="btn" data-act="default" data-i="${idx}">Set Default</button>
              <button class="btn" data-act="edit" data-i="${idx}">Edit</button>
              <button class="btn" data-act="del" data-i="${idx}">Delete</button>
            </div>`;
          list.appendChild(row);
        });
      }
      render();

      add.addEventListener('click', ()=>{
        const form = buildInstanceForm({ default: !getS().instances.length });
        showModal({
          title: 'Add OctoPrint',
          body: form.el,
          onPrimary: ()=>{
            const model = form.read();
            const st = getS();
            if (model.default) st.instances.forEach(i=> i.default=false);
            st.instances.push(model);
            saveS(st);
            render();
          }
        });
      });

      list.addEventListener('click', (e)=>{
        const act = e.target?.getAttribute?.('data-act');
        const i   = Number(e.target?.getAttribute?.('data-i'));
        if (!act || Number.isNaN(i)) return;
        const st = getS();
        const cur = st.instances[i];
        if (!cur) return;

        if (act === 'edit'){
          const form = buildInstanceForm(cur);
          showModal({
            title: 'Edit OctoPrint',
            body: form.el,
            onPrimary: ()=>{
              const m = form.read();
              if (m.default) st.instances.forEach((x,ix)=>{ if (ix!==i) x.default=false; });
              st.instances[i] = m;
              saveS(st); render();
            }
          });
        } else if (act === 'del'){
          st.instances.splice(i,1);
          // ensure one default if any remain
          if (st.instances.length && !st.instances.some(x=>x.default)) st.instances[0].default = true;
          saveS(st); render();
        } else if (act === 'default'){
          st.instances.forEach((x,ix)=> x.default = (ix===i));
          saveS(st); render();
        }
      });

      return wrap;
    },

    // Menu item
    onInit(){
      // Requires SB.addMenuItem from your core helpers
      SB.addMenuItem?.({
        id: 'octo-send',
        pluginId: PID,
        label: 'Send to OctoPrint…',
        iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zM13 4h-2v7H8l4 4 4-4h-3V4z"/></svg>',
        // visible whenever slicer _or_ laser is enabled
        whenEnabledOf: ['slicer','laser'],
        onTap: async () => {
          const inst = getS().instances;
          if (!inst.length) { toast('Add an OctoPrint instance in Settings > OctoPrint'); return; }

          // If exactly one, send immediately
          const target = inst.find(i=>i.default) || inst[0];
          if (inst.length === 1) {
            await sendGCode(target, { gcode: '; demo\nG28\n' });
            return;
          }

          // Otherwise, picker
          showPicker(inst, async (picked)=>{
            await sendGCode(picked, { gcode: '; demo\nG28\n' });
          });
        }
      });

      // Optionally expose an action other plugins can call
      SB.plugins.get(PID).actions = {
        send(payload) {
          const inst = getS().instances;
          if (!inst.length) { toast('No OctoPrint instances configured'); return; }
          const target = inst.find(i=>i.default) || inst[0];
          sendGCode(target, payload);
        }
      };
    },

    onEnable(){},
    onDisable(){},
    onSettings(next){ /* settings persisted via saveS; nothing extra here */ }
  });

})();