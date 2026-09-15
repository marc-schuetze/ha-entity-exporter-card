// Entity Exporter Card for Home Assistant
// Version: 1.3.0
// Author: scharc (https://github.com/scharc)
// License: MIT
// Created using "vibe coding" - collaborative AI-assisted development

const CARD_VERSION = "1.3.0";
console.log("[HA Entity Exporter] Loading version:", CARD_VERSION);

// Known domains, grouped for the UI. Any domain present in hass.states but not
// listed here lands in "Other" — the card never hides a domain it does not know.
const DOMAIN_GROUPS = {
  "Inputs": ["input_boolean","input_number","input_select","input_text","input_datetime","input_button","counter","timer"],
  "Devices": ["sensor","binary_sensor","switch","light","climate","cover","fan","vacuum","media_player","camera","lock","device_tracker","zone","person"],
  "Automation": ["script","automation","scene","button"],
  "Calendar": ["calendar"]
};

// Pure: map the domains actually present in this HA install onto DOMAIN_GROUPS,
// dropping empty groups and collecting unknown domains into "Other".
function groupDomains(presentDomains) {
  const present = new Set(presentDomains);
  const groups = {};
  const known = new Set();
  for (const [name, domains] of Object.entries(DOMAIN_GROUPS)) {
    domains.forEach(d => known.add(d));
    const hits = domains.filter(d => present.has(d));
    if (hits.length) groups[name] = hits;
  }
  const other = presentDomains.filter(d => !known.has(d));
  if (other.length) groups["Other"] = other;
  return groups;
}

console.log("[HA Entity Exporter] Registering custom card");

const HaCard = customElements.get("hui-entities-card");
if (!HaCard) {
  throw new Error("Cannot find Home Assistant card elements. This may be due to a Home Assistant version change.");
}

const LitElement = Object.getPrototypeOf(HaCard);
const html = LitElement.prototype.html;

console.log("[HA Entity Exporter] Setting up styles");

class HaEntityExporterCard extends LitElement {
  static get styles() {
    return [
      LitElement.prototype.styles || [],
      LitElement.prototype.css ? LitElement.prototype.css`
        :host {
          display: block;
          font-family: sans-serif;
          background: #1e1e1e;
          color: white;
          padding: 1rem;
          border-radius: 8px;
          box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
        }
        h2 {
          margin: 0 0 1rem;
        }
        input, button {
          font-size: 0.9rem;
          padding: 0.3rem;
          border: none;
          border-radius: 4px;
        }
        input[type=checkbox] {
          margin-right: 0.25rem;
        }
        .filter-controls, .domain-controls, .button-row {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          margin-bottom: 0.5rem;
        }
        .filter-status {
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
          color: #aaa;
        }
        .live-filter-indicator {
          font-style: italic;
          color: #6af;
        }
        .tags {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          margin-bottom: 0.5rem;
        }
        .tag {
          background: #333;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .tag:hover {
          background: #444;
        }
        .preview {
          max-height: 250px;
          overflow-y: auto;
          background: #111;
          padding: 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
        }
        .bold {
          font-weight: bold;
          margin-top: 0.5rem;
        }
        .domain-section {
          border: 1px solid #333;
          border-radius: 6px;
          padding: 0.5rem;
          margin-bottom: 0.5rem;
          background: #222;
        }
        .section-header {
          display: flex;
          align-items: center;
          margin-bottom: 0.3rem;
        }
        .section-header strong {
          margin-left: 0.25rem;
        }
        .section-domains {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }
        .button-row button.success {
          background: #3a3;
          color: white;
        }
        .button-row button.error {
          background: #a33;
          color: white;
        }
      ` : null
    ].filter(Boolean);
  }

  static get properties() {
    return {
      _config: { state: true },
      _hass: { state: true },
      filters: { state: true },
      selectedDomains: { state: true },
      previewList: { state: true },
      allDomains: { state: true },
      tempFilter: { state: true },
      copyState: { state: true },
      downloadState: { state: true },
      hasClipboardSupport: { state: true },
      domainGroups: { state: true },
    };
  }

  setConfig(config) {
    console.log("[HA Entity Exporter] Card config set:", config);
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
    // ponytail: rescans every entity id on each hass update (~0.1ms at 3.5k entities).
    // Cache against a states-object fingerprint only if this ever shows up in a profile.
    const domains = [...new Set(Object.keys(hass.states || {}).map(id => id.split(".")[0]))].sort();
    if (domains.length !== this.allDomains.length || domains.some((d, i) => d !== this.allDomains[i])) {
      this.allDomains = domains;
      if (!this._domainsInitialized && domains.length) {
        this._domainsInitialized = true;
        this.selectedDomains = new Set(domains);
      }
    }
    this.requestUpdate();
  }

  get domainGroups() { return groupDomains(this.allDomains); }

  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this.filters = [];
    this.selectedDomains = new Set();
    this.previewList = [];
    this.tempFilter = "";
    this.copyState = "idle";
    this.downloadState = "idle";
    this.hasClipboardSupport = false;

    this.allDomains = [];
    this._domainsInitialized = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.hasClipboardSupport = typeof navigator.clipboard !== 'undefined' && 
                              typeof navigator.clipboard.writeText === 'function';
    console.log("[HA Entity Exporter] Card connected, clipboard support:", this.hasClipboardSupport);
  }

  render() {
    if (!this._hass) return html`<div>Loading Home Assistant...</div>`;

    const filteredEntities = this.groupedPreview().reduce((total, group) => total + group.ids.length, 0);
    const totalAvailableEntities = Object.entries(this._hass.states)
      .filter(([id]) => this.selectedDomains.has(id.split(".")[0]))
      .length;

    return html`
      <h2>Entity Exporter</h2>

      <div class="domain-controls">
        <button @click=${this.selectAll}>All</button>
        <button @click=${this.selectNone}>None</button>
        <button @click=${this.invertSelection}>Invert</button>
      </div>

      <div class="filter-controls">
        <input
          .value=${this.tempFilter}
          @input=${this.handleFilterInput}
          placeholder="Filter entities..."
        />
        <button @click=${this.addFilter}>Add Filter</button>
      </div>

      <div class="filter-status">
        Showing ${filteredEntities} of ${totalAvailableEntities} entities
        ${this.tempFilter ? html`<span class="live-filter-indicator">(matching: "${this.tempFilter}")</span>` : ''}
      </div>

      <div class="tags">
        ${this.filters.map((f,i) => html`<span class="tag" @click=${()=>this.removeFilter(i)}>${f} ✕</span>`)}
      </div>

      <!-- Domain sections with section checkbox in front -->
      ${Object.entries(this.domainGroups).map(([groupName, domains]) => html`
        <div class="domain-section">
          <div class="section-header">
            <input type="checkbox"
              .checked=${domains.every(d => this.selectedDomains.has(d))}
              @change=${(e) => this.toggleGroup(groupName, e.target.checked)} />
            <strong>${groupName}</strong>
          </div>
          <div class="section-domains">
            ${domains.map(domain => html`
              <label>
                <input type="checkbox"
                  .checked=${this.selectedDomains.has(domain)}
                  @change=${(e) => this.toggleDomain(domain, e.target.checked)} />
                ${domain}
              </label>
            `)}
          </div>
        </div>
      `)}

      <div class="preview">
        ${this.groupedPreview().map(({ domain, ids }) => html`
          <div class="domain-group">
            <div class="bold">${domain} (${ids.length})</div>
            ${ids.map(id => html`<div>${id}</div>`)}
          </div>
        `)}
      </div>

      <div class="button-row">
        ${this.hasClipboardSupport ? html`<button class=${this.copyState} @click=${this.copyToClipboard}>📋 Copy</button>` : ''}
        <button class=${this.downloadState} @click=${this.downloadJson}>⬇ Download</button>
      </div>
    `;
  }

  handleFilterInput(e) { this.tempFilter = e.target.value; this.requestUpdate(); }
  addFilter() { const f=this.tempFilter.trim(); if(f&&!this.filters.includes(f)) this.filters=[...this.filters,f]; this.tempFilter=""; }
  removeFilter(i){ this.filters=this.filters.filter((_,idx)=>i!==idx); }
  selectAll(){ this.selectedDomains=new Set(this.allDomains); }
  selectNone(){ this.selectedDomains=new Set(); }
  invertSelection(){ const next=new Set(); this.allDomains.forEach(d=>{if(!this.selectedDomains.has(d)) next.add(d);}); this.selectedDomains=next; }
  toggleDomain(domain,checked){ if(checked) this.selectedDomains.add(domain); else this.selectedDomains.delete(domain); this.selectedDomains=new Set(this.selectedDomains); }
  toggleGroup(groupName,checked){ this.domainGroups[groupName].forEach(d=>{if(checked) this.selectedDomains.add(d); else this.selectedDomains.delete(d);}); this.selectedDomains=new Set(this.selectedDomains); }

  groupedPreview(){
    if(!this._hass?.states) return [];
    const tempFilterValue=this.tempFilter.trim();
    const out={};
    Object.entries(this._hass.states).forEach(([id,obj])=>{
      const domain=id.split(".")[0];
      if(!this.selectedDomains.has(domain)) return;
      let matchAnyFilter=false;
      if(this.filters.length>0) matchAnyFilter=this.filters.some(f=>id.toLowerCase().includes(f.toLowerCase()));
      if(tempFilterValue) matchAnyFilter=id.toLowerCase().includes(tempFilterValue.toLowerCase());
      if(!this.filters.length&&!tempFilterValue) matchAnyFilter=true;
      if(matchAnyFilter){ if(!out[domain]) out[domain]=[]; out[domain].push(id);}
    });
    const groupOrder=Object.values(this.domainGroups).flat();
    return Object.entries(out).sort(([a],[b])=>groupOrder.indexOf(a)-groupOrder.indexOf(b)).map(([domain,ids])=>({domain,ids:ids.sort()}));
  }

  prepareExport(){
    const result={};
    this.groupedPreview().flatMap(g=>g.ids).forEach(id=>{
      const obj=this._hass.states[id];
      const attrs=Object.entries(obj.attributes).slice(0,10);
      result[id]={state:obj.state,attributes:Object.fromEntries(attrs)};
    });
    return result;
  }

  async copyToClipboard(){
    try{await navigator.clipboard.writeText(JSON.stringify(this.prepareExport(),null,2)); this.copyState="success"; setTimeout(()=>this.copyState="idle",1500);}
    catch(e){console.error(e); this.copyState="error"; setTimeout(()=>this.copyState="idle",2000);}
  }

  downloadJson(){
    try{const blob=new Blob([JSON.stringify(this.prepareExport(),null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="ha-entities-export.json"; a.click(); this.downloadState="success"; setTimeout(()=>this.downloadState="idle",1500);}
    catch(e){console.error(e); this.downloadState="error"; setTimeout(()=>this.downloadState="idle",2000);}
  }
}

customElements.define("entity-exporter-card", HaEntityExporterCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "entity-exporter-card",
  name: "Entity Exporter",
  description: "Filter and export Home Assistant entities.",
  preview: false,
  version: CARD_VERSION
});

try{
  const event=new Event("ll-rebuild");
  window.dispatchEvent(event);
  console.log("[HA Entity Exporter] Sent rebuild event to Home Assistant");
}catch(e){console.warn("[HA Entity Exporter] Failed to dispatch event:",e);}
