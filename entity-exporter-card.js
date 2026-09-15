// Entity Exporter Card for Home Assistant
// Version: 1.4.0
// Author: Marc Schütze (https://github.com/marc-schuetze)
// License: MIT
// Created using "vibe coding" - collaborative AI-assisted development

const CARD_VERSION = "1.4.0";
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

// Pure: domains the card has never seen before start out selected, so entities
// are never silently withheld. A domain the user deselected stays deselected,
// because it is already in seenDomains and therefore not "new" — including when
// it drops out of the visible set for a while, e.g. while showing only disabled
// entities.
function nextDomainSelection(seenDomains, nextDomains, selected) {
  const known = new Set(seenDomains);
  const out = new Set(selected);
  nextDomains.forEach(d => { if (!known.has(d)) out.add(d); });
  return out;
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
          font-family: var(--paper-font-body1_-_font-family, sans-serif);
          background: var(--ha-card-background, var(--card-background-color, #1e1e1e));
          color: var(--primary-text-color, white);
          padding: 1rem;
          border-radius: var(--ha-card-border-radius, 8px);
          box-shadow: var(--ha-card-box-shadow, 0 0 6px rgba(0, 0, 0, 0.4));
        }
        h2 {
          margin: 0 0 1rem;
        }
        input:not([type=checkbox]), button, select {
          font-size: 0.9rem;
          padding: 0.3rem;
          border: none;
          border-radius: 4px;
          background: var(--secondary-background-color, #eee);
          color: var(--primary-text-color, #111);
        }
        input[type=checkbox] {
          margin-right: 0.25rem;
          accent-color: var(--primary-color, #6af);
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
          color: var(--secondary-text-color, #aaa);
        }
        .error-text {
          color: var(--error-color, #a33);
        }
        .disabled-tag {
          margin-left: 0.4rem;
          padding: 0 4px;
          border-radius: 3px;
          font-size: 0.7rem;
          background: var(--divider-color, #444);
          color: var(--primary-text-color, #aaa);
        }
        .live-filter-indicator {
          font-style: italic;
          color: var(--primary-color, #6af);
        }
        .tags {
          display: flex;
          gap: 0.3rem;
          flex-wrap: wrap;
          margin-bottom: 0.5rem;
        }
        .tag {
          background: var(--secondary-background-color, #333);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .tag:hover {
          background: var(--divider-color, #444);
        }
        .preview {
          max-height: 250px;
          overflow-y: auto;
          background: var(--secondary-background-color, #111);
          padding: 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
        }
        .bold {
          font-weight: bold;
          margin-top: 0.5rem;
        }
        .domain-section {
          border: 1px solid var(--divider-color, #333);
          border-radius: 6px;
          padding: 0.5rem;
          margin-bottom: 0.5rem;
          background: var(--secondary-background-color, #222);
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
          background: var(--success-color, #3a3);
          color: var(--text-primary-color, white);
        }
        .button-row button.error {
          background: var(--error-color, #a33);
          color: var(--text-primary-color, white);
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
      disabledFilter: { state: true },
      disabledState: { state: true },
    };
  }

  setConfig(config) {
    console.log("[HA Entity Exporter] Card config set:", config);
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
    this._refreshDomains();
    this.requestUpdate();
  }

  get domainGroups() { return groupDomains(this.allDomains); }

  // Every entity id the card can currently show. Disabled entities have no
  // state, so they only ever exist as registry rows: "only" is registry rows
  // alone, and is empty until the registry has been read.
  entityIds() {
    const disabled = this._disabledEntities;
    if (this.disabledFilter === "only") return disabled ? [...disabled.keys()] : [];
    const ids = Object.keys(this._hass?.states || {});
    if (this.disabledFilter === "include" && disabled) ids.push(...disabled.keys());
    return ids;
  }

  _refreshDomains() {
    // ponytail: rescans every entity id on each hass update (~0.1ms at 3.5k entities).
    // Cache against a states-object fingerprint only if this ever shows up in a profile.
    const domains = [...new Set(this.entityIds().map(id => id.split(".")[0]))].sort();
    if (domains.length === this.allDomains.length && domains.every((d, i) => d === this.allDomains[i])) return;
    this.selectedDomains = nextDomainSelection(this._seenDomains, domains, this.selectedDomains);
    this._seenDomains = [...new Set([...this._seenDomains, ...domains])];
    this.allDomains = domains;
  }

  // Disabled entities are absent from hass.states, so they have to come from the
  // entity registry. The websocket call needs an admin user; a non-admin gets an
  // error back, which is surfaced rather than swallowed.
  async _loadDisabledEntities() {
    this.disabledState = "loading";
    this.requestUpdate();
    try {
      const registry = await this._hass.callWS({ type: "config/entity_registry/list" });
      this._disabledEntities = new Map(
        registry
          .filter(e => e.disabled_by && !(e.entity_id in this._hass.states))
          .map(e => [e.entity_id, e])
      );
      this.disabledState = "idle";
    } catch (err) {
      console.error("[HA Entity Exporter] Could not read the entity registry:", err);
      this._disabledEntities = null;
      this.disabledFilter = "exclude";
      this.disabledState = "error";
    }
  }

  // "exclude" (default) | "include" | "only"
  async setDisabledFilter(value) {
    this.disabledFilter = value;
    if (value !== "exclude" && !this._disabledEntities) await this._loadDisabledEntities();
    this._refreshDomains();
    this.requestUpdate();
  }

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
    this.disabledFilter = "exclude";
    this.disabledState = "idle";
    this._disabledEntities = null;
    this._seenDomains = [];
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
    const totalAvailableEntities = this.entityIds()
      .filter(id => this.selectedDomains.has(id.split(".")[0]))
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
        <select title="Disabled entities have no state, so they are read from the entity registry"
          .value=${this.disabledFilter}
          .disabled=${this.disabledState === "loading"}
          @change=${(e) => this.setDisabledFilter(e.target.value)}>
          <option value="exclude">Enabled entities</option>
          <option value="include">Enabled + disabled</option>
          <option value="only">Disabled only</option>
        </select>
      </div>

      ${this.disabledState === "loading" ? html`<div class="filter-status">Reading entity registry...</div>` : ''}
      ${this.disabledState === "error" ? html`<div class="filter-status error-text">Could not read the entity registry. Listing disabled entities needs an admin account.</div>` : ''}

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
            ${ids.map(id => html`<div>${id}${this._disabledEntities?.has(id) ? html`<span class="disabled-tag">disabled</span>` : ''}</div>`)}
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
    this.entityIds().forEach(id=>{
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
      if(!obj){
        // Disabled: registry row only, no state and no attributes to report.
        result[id]={state:null,disabled_by:this._disabledEntities?.get(id)?.disabled_by ?? "unknown",attributes:{}};
        return;
      }
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
