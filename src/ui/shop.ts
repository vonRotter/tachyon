import { SHIP_CLASSES } from '../entities/shipClasses';
import {
  EQUIPMENT,
  GUN_TYPES,
  MAX_TIER,
  MISSILE_TYPES,
  PLAYER_SHIPS,
  UPGRADES,
  fitShip,
  newFit,
  shipStats,
  upgradePrice,
  type Campaign,
  type EquipmentId,
  type ShipFit,
} from '../game/loadout';
import { MISSIONS, type MissionDef } from '../game/missions';

type Tab = 'ships' | 'upgrades' | 'weapons' | 'equipment';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const cr = (n: number): string => `${n.toLocaleString('en-US')} cr`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Hangar shop: buy and switch ships, install upgrade tiers, buy and fit weapons and equipment,
 * and pick the next mission. Hovering anything previews its effect on the stat bars.
 */
export class Shop {
  private tab: Tab = 'ships';
  /** Ship shown on the turntable and in the stat panel (may be one not yet owned). */
  private viewShip: string;
  private preview: { shipId: string; fit: ShipFit } | null = null;
  selectedMission: string;

  onChange: () => void = () => {};
  onShowShip: (shipId: string) => void = () => {};
  onLaunch: (missionId: string) => void = () => {};

  constructor(private campaign: Campaign) {
    this.viewShip = campaign.activeShip;
    this.selectedMission = MISSIONS[0].id;
    for (const b of document.querySelectorAll<HTMLButtonElement>('#hangar [data-tab]')) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.render();
      });
    }
    $('hangar-launch').addEventListener('click', () => this.onLaunch(this.selectedMission));
  }

  setCampaign(c: Campaign): void {
    this.campaign = c;
    this.viewShip = c.activeShip;
    this.render();
  }

  render(): void {
    const c = this.campaign;
    $('credits').textContent = cr(c.credits);
    for (const b of document.querySelectorAll<HTMLButtonElement>('#hangar [data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    const list = $('shop-list');
    list.innerHTML = '';
    if (this.tab === 'ships') this.renderShips(list);
    else if (this.tab === 'upgrades') this.renderUpgrades(list);
    else if (this.tab === 'weapons') this.renderWeapons(list);
    else this.renderEquipment(list);
    this.renderStats();
    this.renderMissions();
    this.onShowShip(this.viewShip);
  }

  // --- helpers -------------------------------------------------------------------------------

  private get fit(): ShipFit {
    return this.campaign.fits[this.campaign.activeShip];
  }

  private spend(price: number): boolean {
    if (this.campaign.credits < price) return false;
    this.campaign.credits -= price;
    return true;
  }

  private commit(): void {
    this.preview = null;
    this.onChange();
    this.render();
  }

  private card(title: string, desc: string, opts: { status?: string; active?: boolean } = {}): HTMLDivElement {
    const card = el('div', `card${opts.active ? ' active' : ''}`);
    const head = el('div', 'card-head');
    head.appendChild(el('div', 'card-title', title));
    if (opts.status) head.appendChild(el('div', 'card-status', opts.status));
    card.appendChild(head);
    if (desc) card.appendChild(el('p', 'card-desc', desc));
    return card;
  }

  private button(label: string, onClick: () => void, opts: { disabled?: boolean; primary?: boolean } = {}): HTMLButtonElement {
    const b = el('button', opts.primary ? 'primary' : '', label);
    b.disabled = !!opts.disabled;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private hoverPreview(node: HTMLElement, make: () => { shipId: string; fit: ShipFit } | null): void {
    node.addEventListener('mouseenter', () => {
      this.preview = make();
      this.renderStats();
    });
    node.addEventListener('mouseleave', () => {
      this.preview = null;
      this.renderStats();
    });
  }

  private withFit(change: (f: ShipFit) => void): { shipId: string; fit: ShipFit } {
    const f: ShipFit = JSON.parse(JSON.stringify(this.fit)) as ShipFit;
    change(f);
    return { shipId: this.campaign.activeShip, fit: f };
  }

  // --- tabs ----------------------------------------------------------------------------------

  private renderShips(list: HTMLElement): void {
    const c = this.campaign;
    for (const id of PLAYER_SHIPS) {
      const cls = SHIP_CLASSES[id];
      const owned = c.ships.includes(id);
      const active = c.activeShip === id;
      const card = this.card(cls.name, cls.description ?? '', {
        status: active ? 'FLYING' : owned ? 'OWNED' : cr(cls.price),
        active: this.viewShip === id,
      });
      const row = el('div', 'card-actions');
      if (owned && !active) {
        row.appendChild(
          this.button('Fly this ship', () => {
            c.activeShip = id;
            this.viewShip = id;
            this.commit();
          }),
        );
      } else if (!owned) {
        row.appendChild(
          this.button(
            `Buy · ${cr(cls.price)}`,
            () => {
              if (!this.spend(cls.price)) return;
              c.ships.push(id);
              c.fits[id] = newFit();
              c.activeShip = id;
              this.viewShip = id;
              this.commit();
            },
            { disabled: c.credits < cls.price, primary: true },
          ),
        );
      }
      if (row.childNodes.length) card.appendChild(row);
      card.addEventListener('click', () => {
        this.viewShip = id;
        this.render();
      });
      this.hoverPreview(card, () => ({ shipId: id, fit: c.fits[id] ?? newFit() }));
      list.appendChild(card);
    }
  }

  private renderUpgrades(list: HTMLElement): void {
    const c = this.campaign;
    const shipId = c.activeShip;
    list.appendChild(el('p', 'tab-note', `Upgrades are installed on the ${SHIP_CLASSES[shipId].name} and stay with it.`));
    for (const up of UPGRADES) {
      const tier = this.fit.upgrades[up.id] ?? 0;
      const card = this.card(up.name, up.effect, { status: tier ? `MK ${'I'.repeat(tier)}` : 'STOCK' });
      const pips = el('div', 'pips');
      for (let i = 1; i <= MAX_TIER; i++) pips.appendChild(el('span', i <= tier ? 'pip on' : 'pip'));
      card.appendChild(pips);
      const row = el('div', 'card-actions');
      if (tier < MAX_TIER) {
        const price = upgradePrice(shipId, up, tier + 1);
        row.appendChild(
          this.button(
            `Install Mk ${'I'.repeat(tier + 1)} · ${cr(price)}`,
            () => {
              if (!this.spend(price)) return;
              this.fit.upgrades[up.id] = tier + 1;
              this.commit();
            },
            { disabled: c.credits < price },
          ),
        );
        this.hoverPreview(card, () => this.withFit((f) => (f.upgrades[up.id] = tier + 1)));
      } else row.appendChild(el('span', 'maxed', 'Fully upgraded'));
      card.appendChild(row);
      list.appendChild(card);
    }
  }

  private renderWeapons(list: HTMLElement): void {
    const c = this.campaign;
    list.appendChild(el('h4', 'tab-head', 'Guns'));
    for (const g of Object.values(GUN_TYPES)) {
      const owned = c.guns.includes(g.id);
      const fitted = this.fit.gun === g.id;
      const card = this.card(g.name, g.description, { status: fitted ? 'FITTED' : owned ? 'OWNED' : cr(g.price), active: fitted });
      const row = el('div', 'card-actions');
      if (!fitted) {
        row.appendChild(
          owned
            ? this.button('Fit', () => {
                this.fit.gun = g.id;
                this.commit();
              })
            : this.button(
                `Buy and fit · ${cr(g.price)}`,
                () => {
                  if (!this.spend(g.price)) return;
                  c.guns.push(g.id);
                  this.fit.gun = g.id;
                  this.commit();
                },
                { disabled: c.credits < g.price },
              ),
        );
        card.appendChild(row);
        this.hoverPreview(card, () => this.withFit((f) => (f.gun = g.id)));
      }
      list.appendChild(card);
    }
    list.appendChild(el('h4', 'tab-head', 'Missiles'));
    for (const m of Object.values(MISSILE_TYPES)) {
      const owned = c.missiles.includes(m.id);
      const fitted = this.fit.missile === m.id;
      const card = this.card(m.name, m.description, { status: fitted ? 'FITTED' : owned ? 'OWNED' : cr(m.price), active: fitted });
      const row = el('div', 'card-actions');
      if (!fitted) {
        row.appendChild(
          owned
            ? this.button('Fit', () => {
                this.fit.missile = m.id;
                this.commit();
              })
            : this.button(
                `Buy and fit · ${cr(m.price)}`,
                () => {
                  if (!this.spend(m.price)) return;
                  c.missiles.push(m.id);
                  this.fit.missile = m.id;
                  this.commit();
                },
                { disabled: c.credits < m.price },
              ),
        );
        card.appendChild(row);
        this.hoverPreview(card, () => this.withFit((f) => (f.missile = m.id)));
      }
      list.appendChild(card);
    }
  }

  private renderEquipment(list: HTMLElement): void {
    const c = this.campaign;
    const slots = SHIP_CLASSES[c.activeShip].equipSlots ?? 2;
    const used = this.fit.equipment.length;
    list.appendChild(el('p', 'tab-note', `Equipment slots: ${used} of ${slots} used. Equipment you own can be moved between ships.`));
    for (const e of Object.values(EQUIPMENT)) {
      const owned = c.equipment.includes(e.id);
      const fitted = this.fit.equipment.includes(e.id);
      const card = this.card(e.name, e.description, { status: fitted ? 'FITTED' : owned ? 'OWNED' : cr(e.price), active: fitted });
      const row = el('div', 'card-actions');
      const full = used >= slots;
      const fitIt = (id: EquipmentId) => {
        // an item can only be in one ship at a time
        for (const f of Object.values(c.fits)) f.equipment = f.equipment.filter((x) => x !== id);
        this.fit.equipment.push(id);
      };
      if (fitted) {
        row.appendChild(
          this.button('Remove', () => {
            this.fit.equipment = this.fit.equipment.filter((x) => x !== e.id);
            this.commit();
          }),
        );
      } else if (owned) {
        const elsewhere = Object.entries(c.fits).find(([, f]) => f.equipment.includes(e.id));
        row.appendChild(
          this.button(elsewhere ? `Move from ${SHIP_CLASSES[elsewhere[0]].name.split(' ')[0]}` : 'Fit', () => {
            fitIt(e.id);
            this.commit();
          }, { disabled: full }),
        );
      } else {
        row.appendChild(
          this.button(
            full ? `Buy · ${cr(e.price)} (no free slot)` : `Buy and fit · ${cr(e.price)}`,
            () => {
              if (!this.spend(e.price)) return;
              c.equipment.push(e.id);
              if (!full) fitIt(e.id);
              this.commit();
            },
            { disabled: c.credits < e.price },
          ),
        );
      }
      card.appendChild(row);
      if (!fitted && !full) this.hoverPreview(card, () => this.withFit((f) => f.equipment.push(e.id)));
      list.appendChild(card);
    }
  }

  // --- stats panel ---------------------------------------------------------------------------

  private renderStats(): void {
    const c = this.campaign;
    const viewId = this.preview?.shipId ?? this.viewShip;
    const cls = SHIP_CLASSES[viewId];
    $('ship-name').textContent = cls.name;
    const owned = c.ships.includes(viewId);
    $('ship-desc').textContent = owned ? (viewId === c.activeShip ? 'Your current ship.' : 'In your hangar.') : `For sale: ${cr(cls.price)}`;
    const current = fitShip(c.activeShip, this.fit).cls;
    const shown = this.preview
      ? fitShip(this.preview.shipId, this.preview.fit).cls
      : fitShip(viewId, c.fits[viewId] ?? newFit()).cls;
    const a = shipStats(current);
    const b = shipStats(shown);
    const root = $('ship-stats');
    root.innerHTML = '';
    b.forEach((s, i) => {
      const row = el('div', 'stat');
      row.appendChild(el('span', 'stat-label', s.label));
      const bar = el('div', 'stat-bar');
      const base = Math.min(a[i].value, s.value) / s.max;
      const fill = el('div', 'stat-fill');
      fill.style.width = `${Math.min(1, base) * 100}%`;
      bar.appendChild(fill);
      if (Math.abs(s.value - a[i].value) > 1e-6) {
        const delta = el('div', s.value > a[i].value ? 'stat-delta up' : 'stat-delta down');
        const lo = Math.min(a[i].value, s.value) / s.max;
        const hi = Math.max(a[i].value, s.value) / s.max;
        delta.style.left = `${Math.min(1, lo) * 100}%`;
        delta.style.width = `${Math.max(0, Math.min(1, hi) - Math.min(1, lo)) * 100}%`;
        bar.appendChild(delta);
      }
      row.appendChild(bar);
      row.appendChild(el('span', 'stat-value', s.text));
      root.appendChild(row);
    });
    const fitEl = $('ship-fit');
    fitEl.innerHTML = '';
    const f = c.fits[viewId];
    if (f) {
      const slots = cls.equipSlots ?? 2;
      const lines = [
        `Guns: ${GUN_TYPES[f.gun]?.name ?? '—'}`,
        `Missiles: ${MISSILE_TYPES[f.missile]?.name ?? '—'}`,
        `Equipment (${f.equipment.length}/${slots}): ${f.equipment.map((e) => EQUIPMENT[e].name).join(', ') || 'none'}`,
      ];
      for (const l of lines) fitEl.appendChild(el('div', '', l));
    }
    this.onShowShip(viewId);
  }

  // --- missions ------------------------------------------------------------------------------

  private renderMissions(): void {
    const c = this.campaign;
    const root = $('mission-list');
    root.innerHTML = '';
    const missions = MISSIONS.filter((m) => m.available(c));
    if (!missions.some((m) => m.id === this.selectedMission)) this.selectedMission = missions[0].id;
    for (const m of missions) root.appendChild(this.missionCard(m));
  }

  private missionCard(m: MissionDef): HTMLElement {
    const done = this.campaign.completed[m.id] ?? 0;
    const card = this.card(`${m.name} · ${m.location}`, m.briefing, {
      status: done ? `FLOWN ×${done} · ${cr(Math.round(m.pay * 0.4))}+` : `${cr(m.pay)}+`,
      active: m.id === this.selectedMission,
    });
    card.addEventListener('click', () => {
      this.selectedMission = m.id;
      this.renderMissions();
    });
    return card;
  }
}
