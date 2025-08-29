/* global window, document, SB, SB_Store */

/**
 * OctoPrint plugin
 * - Built-in plugin
 * - Contributes a settings tab (lists instances with Add/Edit/Delete)
 * - Dynamically injects/removes its own modal for Add/Edit
 * - Provides "Send to OctoPrint…" menu action
 */

(function(){
  const Store = SB_Store;

  // ----- persistent state under SB.settings['octoprint'] -----
  function getState(){
    const all = Store.get('sb:settings', {});
    return (all['octoprint'] ||= { instances: [] });
  }
  function setState(next){
    const all = Store.get('sb:settings', {});
    all['octoprint'] = next;
    Store.set('sb:settings', all);
  }

  // optional schema so host gives us a tab label (we render a custom panel)
  const schema = { title: 'OctoPrint', fields: [] };

  // ---- Modal creation / teardown (dynamic) ----
  function buildModal() {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal-card">
        <div class="modal-title"><span id="octo-modal-title">OctoPrint</span></div>
        <div class="modal-body" style="padding:12px">
          <div class="card">
            <label>Name <input id="op-name" /></label>
            <label>Base URL (e.g. https://printer.local) <input id="op-url" placeholder="https://..."/></label>
            <label>API Key <input id="op-key" placeholder="••••••••"/></label>
            <label>Default?
              <select id="op-default">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button id="octo-cancel" class="btn">Cancel</button>
          <button id="octo-save" class="btn primary">Save</button>
        </div>
      </div>
    `;
    return wrap;
  }

  function openEditor(index=null, refreshListCb=()=>{}){
    const st = getState();
    const modal = buildModal();
    const omTitle   = modal.querySelector('#octo-modal-title');
    const opName    = modal.querySelector('#op-name');
    const opUrl     = modal.querySelector('#op-url');
    const opKey     = modal.querySelector('#op-key');
    const opDefault = modal.querySelector('#op-default');
    const omCancel  = modal.querySelector('#octo-cancel');
    const omSave    = modal.querySelector('#octo-save');

    const isEdit = Number.isInteger(index);
    omTitle.textContent = isEdit ? 'Edit OctoPrint' : 'Add OctoPrint';

    const src = isEdit ? st.instances[index] : { name:'', url:'', key:'', default: st.instances.length===0 };
    opName.value    = src.name || '';
    opUrl.value     = src.url || '';
    opKey.value     = src.key || '';
    opDefault.value = (src.default ? 'yes' : 'no');

    function close(){
      document.body.removeChild(modal);
    }

    omCancel.addEventListener('click', close);
    modal.addEventListener('click', (e)=>{ if (e.target===modal) close(); });

    omSave.addEventListener('click', ()=>{
      const model = {
        name: opName.value.trim(),
        url: opUrl.value.trim(),
        key: opKey.value.trim(),
        default: (opDefault.value === 'yes')
      };

      // single default enforcement
      if (model.default) st.instances.forEach(o => o.default = false);

      if (isEdit) st.instances[index] = model;
      else {
        if (!st.instances.some(o => o.default)) model.default = true;
        st.instances.push(model);
      }
      setState(st);
      close();
      refreshListCb(); // re-render list in settings panel
    });

    document.body.appendChild(modal);
  }

  // ---- Register plugin with SB host ----
  SB.register({
    id: 'octoprint',
    name: 'OctoPrint',
    builtIn: true,
    schema,

    onSettings(s){
      // normalize shape if user had older settings
      if (!s || !Array.isArray(s.instances)) {
        const st = getState();
        setState(st);
      }
    },

    onInit(){
      // add main menu action
      SB.addMenuItem({
        id: 'send-octoprint',
        label: 'Send to OctoPrint…',
        whenEnabledOf: ['slicer','laser','octoprint'],
        onTap: async () => {
          const st = getState();
          if (!st.instances.length) {
            alert('No OctoPrint instances configured. Add one in Settings → OctoPrint.');
            return;
          }
          let target = st.instances.find(x=>x.default) || st.instances[0];
          if (st.instances.length > 1) {
            const names = st.instances.map((x,i)=> `${i+1}. ${x.name} (${x.url})`).join('\n');
            const pick = prompt(`Send to which OctoPrint?\n${names}\nEnter number:`, '1');
            const idx = Math.max(1, Math.min(st.instances.length, parseInt(pick||'1',10))) - 1;
            target = st.instances[idx];
          }
          // TODO: package G-code and POST to OctoPrint REST API with X-Api-Key header
          console.log('[OctoPrint] would send to', target);
          alert(`(Demo) Would send G-code to ${target.name} at ${target.url}`);
        }
      });
    },

    /**
     * Custom settings tab content
     * Host calls this when the plugin is enabled and its tab is active.
     */
    buildSettingsPanel(api){
      // api = { settings, save(next) }  — we store state in sb:settings under 'octoprint'
      const st = getState();
      const root = document.createElement('div');

      const header = document.createElement('div'); header.className = 'section';
      header.innerHTML = `<h3>OctoPrint</h3>`;
      root.appendChild(header);

      const card = document.createElement('div'); card.className = 'card';
      root.appendChild(card);

      const list = document.createElement('div'); list.id = 'octo-list';
      const btnAdd = document.createElement('button'); btnAdd.className='btn primary'; btnAdd.textContent='Add OctoPrint';
      card.appendChild(list);
      card.appendChild(btnAdd);

      function render(){
        const curr = getState(); // refresh from store so we’re always current
        list.innerHTML = '';
        (curr.instances||[]).forEach((o, idx)=>{
          const row = document.createElement('div'); row.className='machine-row';
          const isDefault = (o.default === true);
          row.innerHTML = `
            <div>
              <strong>${o.name || 'Unnamed'}</strong>
              <span style="opacity:.7">(${o.url || ''})</span>
              ${isDefault ? '<span style="margin-left:6px;padding:2px 6px;border:1px solid var(--line);border-radius:999px;font-size:12px;opacity:.8">Default</span>':''}
            </div>
            <div class="machine-actions">
              <button class="btn" data-act="edit">Edit</button>
              <button class="btn" data-act="delete">Delete</button>
            </div>
          `;
          row.querySelector('[data-act="edit"]').addEventListener('click', ()=> openEditor(idx, render));
          row.querySelector('[data-act="delete"]').addEventListener('click', ()=>{
            const next = getState();
            next.instances.splice(idx,1);
            if (!next.instances.some(e => e.default) && next.instances.length>0) next.instances[0].default = true;
            setState(next);
            render();
          });
          list.appendChild(row);
        });
      }

      btnAdd.addEventListener('click', ()=> openEditor(null, render));
      render();
      return root;
    }
  });

})();