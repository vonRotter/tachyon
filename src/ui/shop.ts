import { FACTION_DESIGN, FACTIONS } from '../entities/factions';
import { SHIP_CLASSES } from '../entities/shipClasses';
import {
  EQUIPMENT,
  GUN_TYPES,
  MAX_TIER,
  MISSILE_TYPES,
  PLAYER_SHIPS,
  YARDS,
  START_BUDGET,
  UPGRADES,
  canMount,
  fitShip,
  maxedFit,
  newFit,
  shipAvailability,
  yardVisible,
  shipStats,
  upgradePrice,
  weaponInfo,
  type Campaign,
  type EquipmentId,
  type ShipFit,
} from '../game/loadout';
import { DATABASE, DB_CATEGORIES, dbVisible, type DbEntry } from '../game/database';
import { MISSIONS, type MissionDef } from '../game/missions';
import type { FactionId } from '../entities/factions';

type Tab = 'ships' | 'upgrades' | 'weapons' | 'equipment' | 'database';

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
  /** Weapon slot being refitted on the Weapons tab. */
  private slot = 0;
  selectedMission: string;

  onChange: () => void = () => {};
  onShowShip: (shipId: string) => void = () => {};
  /** Database tab: show an entry on the turntable in a faction's paint. */
  onShowEntry: (entry: DbEntry, faction: FactionId) => void = () => {};
  private dbEntry = DATABASE[0];
  private dbFaction: FactionId = DATABASE[0].operators[0];
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
    $('credits').textContent = c.unlimited ? '∞ cr (test mode)' : cr(c.credits);
    if (!c.started) this.tab = 'ships';
    for (const b of document.querySelectorAll<HTMLButtonElement>('#hangar [data-tab]')) {
      b.classList.toggle('on', b.dataset.tab === this.tab);
      b.disabled = !c.started && b.dataset.tab !== 'ships';
    }
    ($('hangar-launch') as HTMLButtonElement).disabled = !c.started;
    const list = $('shop-list');
    list.innerHTML = '';
    if (!c.started) this.renderStartPick(list);
    else if (this.tab === 'ships') this.renderShips(list);
    else if (this.tab === 'upgrades') this.renderUpgrades(list);
    else if (this.tab === 'weapons') this.renderWeapons(list);
    else if (this.tab === 'equipment') this.renderEquipment(list);
    else this.renderDatabase(list);
    this.renderStats();
    this.renderMissions();
  }

  // --- helpers -------------------------------------------------------------------------------

  private get fit(): ShipFit {
    return this.campaign.fits[this.campaign.activeShip];
  }

  private afford(price: number): boolean {
    return this.campaign.unlimited || this.campaign.credits >= price;
  }

  private spend(price: number): boolean {
    if (!this.afford(price)) return false;
    if (!this.campaign.unlimited) this.campaign.credits -= price;
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

  /** New campaign: choose the first ship; what it does not cost is your starting cash. */
  private renderStartPick(list: HTMLElement): void {
    const c = this.campaign;
    list.appendChild(
      el('p', 'tab-note', `Choose your first ship. You have ${cr(START_BUDGET)}: whatever the ship does not cost, you keep for upgrades, weapons and equipment.`),
    );
    list.appendChild(el('p', 'tab-note', 'Only the independent yards will sell to a pilot nobody has hired yet. Faction yards open up once you work for a faction.'));
    for (const id of PLAYER_SHIPS.filter((s) => (SHIP_CLASSES[s].maker ?? 'kestrel') === 'kestrel' && SHIP_CLASSES[s].price <= START_BUDGET)) {
      const cls = SHIP_CLASSES[id];
      const left = START_BUDGET - cls.price;
      const card = this.card(cls.name, cls.description ?? '', { status: cr(cls.price), active: this.viewShip === id });
      this.traits(card, id);
      card.appendChild(el('p', 'card-desc', `Leaves you ${cr(left)} to spend.`));
      const row = el('div', 'card-actions');
      row.appendChild(
        this.button(
          'Start with this ship',
          () => {
            if (!c.unlimited) c.credits = left;
            c.ships = [id];
            c.fits = { [id]: newFit(id) };
            c.activeShip = id;
            c.started = true;
            this.viewShip = id;
            this.commit();
          },
          { primary: true },
        ),
      );
      card.appendChild(row);
      card.addEventListener('click', () => {
        this.viewShip = id;
        this.render();
      });
      this.hoverPreview(card, () => ({ shipId: id, fit: newFit(id) }));
      list.appendChild(card);
    }
  }

  /** Strengths and weaknesses lines on a ship card. */
  private traits(card: HTMLElement, id: string): void {
    const cls = SHIP_CLASSES[id];
    if (cls.strengths) card.appendChild(el('p', 'trait good', `+ ${cls.strengths}`));
    if (cls.weaknesses) card.appendChild(el('p', 'trait bad', `− ${cls.weaknesses}`));
  }

  /** Ships grouped by yard, each yard with its design principle; locked yards stay browsable. */
  private renderShips(list: HTMLElement): void {
    const c = this.campaign;
    for (const yard of YARDS) {
      const ids = PLAYER_SHIPS.filter((s) => (SHIP_CLASSES[s].maker ?? 'kestrel') === yard);
      if (!ids.length) continue;
      const design = FACTION_DESIGN[yard];
      if (!yardVisible(yard, c)) {
        // you know the yard exists once you work for them, but they show you nothing yet
        if (c.allegiance === yard) {
          const head = el('div', 'yard-head');
          head.style.borderColor = FACTIONS[yard].hudColor;
          head.appendChild(el('div', 'yard-name', design?.yard ?? FACTIONS[yard].name));
          head.appendChild(el('div', 'yard-gate', 'Closed to you'));
          list.appendChild(head);
          list.appendChild(el('p', 'yard-note', `Fly a contract for the ${FACTIONS[yard].name} and their yards will open to you.`));
        }
        continue;
      }
      const head = el('div', 'yard-head');
      head.style.borderColor = FACTIONS[yard].hudColor;
      head.appendChild(el('div', 'yard-name', design?.yard ?? FACTIONS[yard].name));
      const gate = yard === 'kestrel' ? 'Open to all' : yard === 'patrol' ? 'Not for sale' : c.allegiance === yard ? 'You fly for them' : 'Test cheat';
      head.appendChild(el('div', 'yard-gate', gate));
      list.appendChild(head);
      if (design) {
        list.appendChild(el('p', 'yard-note', design.principle));
        list.appendChild(el('p', 'yard-note', design.doctrine));
      }
      for (const id of ids) this.shipCard(list, id);
    }
  }

  private shipCard(list: HTMLElement, id: string): void {
    const c = this.campaign;
    const cls = SHIP_CLASSES[id];
    const owned = c.ships.includes(id);
    const active = c.activeShip === id;
    const avail = shipAvailability(id, c);
    const card = this.card(cls.name, cls.description ?? '', {
      status: active ? 'FLYING' : owned ? 'OWNED' : cls.forSale === false ? 'NOT FOR SALE' : cr(cls.price),
      active: this.viewShip === id,
    });
    if (!owned && !avail.ok) card.classList.add('locked');
    this.traits(card, id);
    const row = el('div', 'card-actions');
    if (owned && !active) {
      row.appendChild(
        this.button('Fly this ship', () => {
          c.activeShip = id;
          this.viewShip = id;
          this.slot = 0;
          this.commit();
        }),
      );
    } else if (!owned && avail.ok) {
      row.appendChild(
        this.button(
          `Buy · ${cr(cls.price)}`,
          () => {
            if (!this.spend(cls.price)) return;
            c.ships.push(id);
            c.fits[id] = newFit(id);
            c.activeShip = id;
            this.viewShip = id;
            this.slot = 0;
            this.commit();
          },
          { disabled: !this.afford(cls.price), primary: true },
        ),
      );
      if (avail.reason) row.appendChild(el('span', 'lock-note', avail.reason));
    } else if (!owned) {
      row.appendChild(el('span', 'lock-note', avail.reason));
    }
    if (row.childNodes.length) card.appendChild(row);
    card.addEventListener('click', () => {
      this.viewShip = id;
      this.render();
    });
    this.hoverPreview(card, () => ({ shipId: id, fit: c.fits[id] ?? newFit(id) }));
    list.appendChild(card);
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
            { disabled: !this.afford(price) },
          ),
        );
        this.hoverPreview(card, () => this.withFit((f) => (f.upgrades[up.id] = tier + 1)));
      } else row.appendChild(el('span', 'maxed', 'Fully upgraded'));
      card.appendChild(row);
      list.appendChild(card);
    }
  }

  /**
   * Weapon slots: pick a slot, then fit a gun or launcher to it. Whatever comes out goes to
   * storage and can be fitted again on any ship.
   */
  private renderWeapons(list: HTMLElement): void {
    const c = this.campaign;
    const shipId = c.activeShip;
    const cls = SHIP_CLASSES[shipId];
    const fit = this.fit;
    const slots = fit.weapons.length;
    this.slot = Math.min(this.slot, slots - 1);
    list.appendChild(
      el(
        'p',
        'tab-note',
        `${cls.name}: ${slots} weapon slots. ${cls.missiles > 0 ? `Missile magazine: ${cls.missiles} rounds, shared by all launchers.` : 'No missile magazine: guns only.'} Pick a slot, then fit a weapon to it.`,
      ),
    );
    fit.weapons.forEach((wid, i) => {
      const w = wid ? weaponInfo(wid) : null;
      const card = this.card(`Slot ${i + 1}`, w ? w.name : 'Empty', { status: w ? (w.kind === 'gun' ? 'GUN' : 'LAUNCHER') : '', active: i === this.slot });
      card.classList.add('slot-card');
      if (wid) {
        const row = el('div', 'card-actions');
        row.appendChild(
          this.button('Remove to storage', () => {
            fit.weapons[i] = null;
            c.inventory[wid] = (c.inventory[wid] ?? 0) + 1;
            this.commit();
          }),
        );
        card.appendChild(row);
      }
      card.addEventListener('click', () => {
        this.slot = i;
        this.render();
      });
      list.appendChild(card);
    });

    const fitTo = (id: string, fromStorage: boolean) => {
      const old = fit.weapons[this.slot];
      if (fromStorage) c.inventory[id] = Math.max(0, (c.inventory[id] ?? 0) - 1);
      if (old) c.inventory[old] = (c.inventory[old] ?? 0) + 1;
      fit.weapons[this.slot] = id;
      this.commit();
    };
    const offer = (id: string) => {
      const w = weaponInfo(id);
      if (!w) return;
      const stored = c.inventory[id] ?? 0;
      const mountable = canMount(shipId, id);
      const fitted = fit.weapons[this.slot] === id;
      const card = this.card(w.name, w.description, {
        status: stored ? `IN STORAGE: ${stored}` : cr(w.price),
        active: fitted,
      });
      const row = el('div', 'card-actions');
      if (!mountable) row.appendChild(el('span', 'maxed', 'Needs a missile magazine'));
      else if (!fitted) {
        if (stored > 0) row.appendChild(this.button(`Fit to slot ${this.slot + 1}`, () => fitTo(id, true), { primary: true }));
        row.appendChild(
          this.button(`Buy and fit · ${cr(w.price)}`, () => this.spend(w.price) && fitTo(id, false), { disabled: !this.afford(w.price) }),
        );
      }
      card.appendChild(row);
      list.appendChild(card);
    };
    list.appendChild(el('h4', 'tab-head', `Guns for slot ${this.slot + 1}`));
    for (const g of Object.values(GUN_TYPES)) offer(g.id);
    list.appendChild(el('h4', 'tab-head', `Missile launchers for slot ${this.slot + 1}`));
    for (const m of Object.values(MISSILE_TYPES)) offer(m.id);
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
            { disabled: !this.afford(e.price) },
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
    if (this.tab === 'database' && this.campaign.started) {
      this.renderEntry();
      return;
    }
    const c = this.campaign;
    const viewId = this.preview?.shipId ?? this.viewShip;
    const cls = SHIP_CLASSES[viewId];
    $('ship-name').textContent = cls.name;
    const owned = c.ships.includes(viewId);
    const avail = shipAvailability(viewId, c);
    $('ship-desc').textContent = owned
      ? viewId === c.activeShip
        ? 'Your current ship.'
        : 'In your hangar.'
      : avail.ok
        ? `For sale: ${cr(cls.price)}`
        : avail.reason;
    // compare against what you fly now (or, before the first pick, against the viewed ship)
    const baseId = c.started ? c.activeShip : viewId;
    const baseFit = c.fits[baseId] ?? newFit(baseId);
    const viewFit = this.preview ? this.preview.fit : (c.fits[viewId] ?? newFit(viewId));
    const a = shipStats(fitShip(baseId, baseFit).cls);
    const b = shipStats(fitShip(viewId, viewFit).cls);
    const ceiling = shipStats(fitShip(viewId, maxedFit(viewFit)).cls);
    const root = $('ship-stats');
    root.innerHTML = '';
    b.forEach((s, i) => {
      const row = el('div', 'stat');
      row.appendChild(el('span', 'stat-label', s.label));
      const bar = el('div', 'stat-bar');
      // faint: the most this hull can reach with every upgrade installed
      const max = el('div', 'stat-max');
      max.style.width = `${Math.min(1, ceiling[i].value / s.max) * 100}%`;
      bar.appendChild(max);
      const lo = Math.min(a[i].value, s.value) / s.max;
      const fill = el('div', 'stat-fill');
      fill.style.width = `${Math.min(1, lo) * 100}%`;
      bar.appendChild(fill);
      if (Math.abs(s.value - a[i].value) > 1e-6) {
        const delta = el('div', s.value > a[i].value ? 'stat-delta up' : 'stat-delta down');
        const hi = Math.max(a[i].value, s.value) / s.max;
        delta.style.left = `${Math.min(1, lo) * 100}%`;
        delta.style.width = `${Math.max(0, Math.min(1, hi) - Math.min(1, lo)) * 100}%`;
        bar.appendChild(delta);
      }
      row.appendChild(bar);
      row.title = `Fully upgraded: ${ceiling[i].text}`;
      row.appendChild(el('span', 'stat-value', s.text));
      root.appendChild(row);
    });
    const fitEl = $('ship-fit');
    fitEl.innerHTML = '';
    const names = viewFit.weapons.map((w) => (w ? (weaponInfo(w)?.name ?? '—') : 'empty'));
    const slots = cls.equipSlots ?? 2;
    const lines = [
      `Weapons: ${names.join(', ')}`,
      `Equipment (${viewFit.equipment.length}/${slots}): ${viewFit.equipment.map((e) => EQUIPMENT[e].name).join(', ') || 'none'}`,
      'Faint bars: the hull fully upgraded.',
    ];
    for (const l of lines) fitEl.appendChild(el('div', '', l));
    this.onShowShip(viewId);
  }

  // --- database ------------------------------------------------------------------------------

  private renderDatabase(list: HTMLElement): void {
    list.appendChild(el('p', 'tab-note', 'Everything you can meet in the Reach. Select an entry to put it on the turntable.'));
    for (const cat of DB_CATEGORIES) {
      list.appendChild(el('div', 'tab-head', cat));
      for (const e of DATABASE.filter((d) => d.category === cat && dbVisible(d, this.campaign))) {
        const card = this.card(e.name, '', { status: e.operators.map((f) => FACTIONS[f].name).join(' · '), active: this.dbEntry === e });
        card.classList.add('db-card');
        card.addEventListener('click', () => {
          this.dbEntry = e;
          this.dbFaction = e.operators[0];
          this.render();
        });
        list.appendChild(card);
      }
    }
  }

  private renderEntry(): void {
    const e = this.dbEntry;
    $('ship-name').textContent = e.name;
    $('ship-desc').textContent = e.category;
    const root = $('ship-stats');
    root.innerHTML = '';
    for (const [k, v] of e.facts) {
      const row = el('div', 'db-fact');
      row.appendChild(el('span', 'stat-label', k));
      row.appendChild(el('span', 'db-value', v));
      root.appendChild(row);
    }
    const fitEl = $('ship-fit');
    fitEl.innerHTML = '';
    fitEl.appendChild(el('p', 'db-blurb', e.blurb));
    if (e.operators.length > 1) {
      const row = el('div', 'db-paint');
      row.appendChild(el('span', 'stat-label', 'Flown by'));
      for (const f of e.operators) {
        const b = this.button(FACTIONS[f].name, () => {
          this.dbFaction = f;
          this.renderEntry();
        });
        b.classList.toggle('on', f === this.dbFaction);
        b.style.borderColor = FACTIONS[f].hudColor;
        row.appendChild(b);
      }
      fitEl.appendChild(row);
    }
    this.onShowEntry(e, this.dbFaction);
  }

  // --- missions ------------------------------------------------------------------------------

  private renderMissions(): void {
    const c = this.campaign;
    const root = $('mission-list');
    root.innerHTML = '';
    if (!c.started) {
      root.appendChild(el('p', 'tab-note', 'Pick a ship to see your first contract.'));
      return;
    }
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
