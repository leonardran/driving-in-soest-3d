// Pop-up adverts, in the spirit of the pop-ups everyone grew up closing.
//
// One card at a time, in the corner: a title bar, the EuroClix logo, a made-up
// offer, a claim button and a close button. It never blocks play — the car keeps
// driving underneath — it dismisses itself after a while, and the whole thing
// can be turned off in the phone's options.

const LOGO_URL = 'src/assets/euroclix.svg';

const OFFERS = [
  {
    title: 'Welkom terug bij EuroClix',
    body: 'Je reed deze week flink wat kilometers. Zet ze om in punten en spaar voor je volgende tankbeurt.',
    claim: 'Claim € 0,25',
    reward: 0.25
  },
  {
    title: 'Soest Spaaractie',
    body: 'Deelnemende winkels in Soest geven dubbele punten op je boodschappen. Alleen deze week.',
    claim: 'Activeer actie',
    reward: 0.5
  },
  {
    title: 'Gefeliciteerd, bijna!',
    body: 'Je bent 3 punten verwijderd van een gratis koffie bij een deelnemend tankstation.',
    claim: 'Bekijk punten',
    reward: 0.15
  },
  {
    title: 'EuroClix Taxi Bonus',
    body: 'Elke afgeronde rit levert je vandaag extra punten op. Rijd door en spaar automatisch mee.',
    claim: 'Claim bonus',
    reward: 0.35
  }
];

const FIRST_DELAY = 22; // seconds into a session
const MIN_GAP = 75;
const MAX_GAP = 145;
const LIFETIME = 13; // seconds before it closes itself

export class AdPopups {
  constructor(opts = {}) {
    this.host = opts.host || null;
    this.wallet = opts.wallet || null;
    this.hud = opts.hud || null;
    this.audio = opts.audio || null;
    this.enabled = opts.enabled !== false;
    this.el = null;
    this.timer = FIRST_DELAY;
    this.life = 0;
    this.shown = 0;
    this.index = 0;
    this.onClaim = opts.onClaim || null;
  }

  /** Turn adverts off (or back on) — also used by the phone's options. */
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.close();
    else this.timer = Math.max(this.timer, 25);
  }

  get visible() {
    return !!(this.el && this.el.classList.contains('show'));
  }

  update(dt) {
    if (!this.enabled) return;
    if (this.visible) {
      this.life -= dt;
      if (this.life <= 0) this.close();
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) this.open();
  }

  open() {
    if (!this.host || this.visible) return;
    const offer = OFFERS[this.index % OFFERS.length];
    this.index++;
    this.shown++;

    const el = document.createElement('div');
    el.className = 'ad-pop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Advertentie');
    el.innerHTML = `
      <div class="ad-pop-head">
        <span class="ad-pop-dots"><i></i><i></i><i></i></span>
        <span class="ad-pop-url">euroclix.nl</span>
        <button type="button" class="ad-pop-close" aria-label="Sluiten">×</button>
      </div>
      <div class="ad-pop-body">
        <img class="ad-pop-logo" src="${LOGO_URL}" alt="EuroClix" />
        <b class="ad-pop-title">${offer.title}</b>
        <p class="ad-pop-text">${offer.body}</p>
        <div class="ad-pop-actions">
          <button type="button" class="ad-pop-claim"></button>
          <button type="button" class="ad-pop-skip">Nee, bedankt</button>
        </div>
        <span class="ad-pop-ad">ADVERTENTIE</span>
      </div>`;

    el.querySelector('.ad-pop-close').addEventListener('click', () => this.close());
    el.querySelector('.ad-pop-skip').addEventListener('click', () => this.close());
    const claim = el.querySelector('.ad-pop-claim');
    claim.textContent = offer.claim;
    claim.addEventListener('click', () => {
      if (this.wallet && offer.reward) this.wallet.add(offer.reward);
      if (this.hud) this.hud.toast(`EuroClix · € ${offer.reward.toFixed(2)} bijgeschreven`);
      if (this.audio) this.audio.playChime('cash');
      if (this.onClaim) this.onClaim(offer);
      this.close();
    });

    this.host.appendChild(el);
    this.el = el;
    // next frame, so the slide-in transition runs
    requestAnimationFrame(() => el.classList.add('show'));
    this.life = LIFETIME;
  }

  close() {
    const el = this.el;
    this.el = null;
    if (el) {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 260);
    }
    this.timer = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
  }

  /** Pop one up straight away, e.g. after finishing a ride. */
  poke() {
    if (!this.enabled || this.visible) return;
    this.timer = 0;
  }
}
