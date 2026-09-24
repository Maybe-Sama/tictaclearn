import './style.css';
import { FLAGS_PACK } from './content/flags';
import { PACKS } from './content/index';
import { Game } from './game/Game';
import { Input } from './input/Input';
import { DebugPanel } from './ui/Debug';
import { Particles } from './ui/Particles';
import { CalibrationScreen, Menu, PauseOverlay, ResultsScreen } from './ui/Screens';
import { Stage } from './ui/Stage';
import { FreeScreen, TourScreen } from './ui/Hubs';
import { ChoiceScreen } from './ui/Choice';
import { applyLayout, pickLayout, TOUCH } from './ui/layout';

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const autoplay = debug ? params.get('autoplay') : null;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stageEl = document.getElementById('stage')!;
document.body.classList.toggle('touch', TOUCH);
// Layout first: every screen reads it while building.
applyLayout(pickLayout(window.innerWidth, window.innerHeight), stageEl);
stageEl.innerHTML = `<div class="deco" aria-hidden="true">
  <i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i>
  <i class="spark s1">✦</i><i class="spark s2">✦</i><i class="spark s3">✦</i><i class="spark s4">✦</i>
</div>`;

const canvas = document.createElement('canvas');
canvas.className = 'fx';
const fx = new Particles(canvas, reduced);
const stage = new Stage(stageEl, FLAGS_PACK, fx, reduced);
stageEl.appendChild(canvas);
const menu = new Menu(stageEl, FLAGS_PACK, PACKS);
const results = new ResultsScreen(stageEl, FLAGS_PACK);
const pause = new PauseOverlay(stageEl);
const calib = new CalibrationScreen(stageEl);
const choice = new ChoiceScreen(stageEl, 'flow');
const tour = new TourScreen(stageEl);
const free = new FreeScreen(stageEl);

const game = new Game(PACKS, { stage, menu, results, pause, calib, tour, free, choice, fx, debug: debug ? new DebugPanel() : null }, { debug, autoplay });
// Taps anywhere (letterbox bands included) count as hits.
new Input(document.body).on((a, ts) => game.onAction(a, ts));

function fit(): void {
  const lay = pickLayout(window.innerWidth, window.innerHeight);
  applyLayout(lay, stageEl);
  const s = Math.min(window.innerWidth / lay.w, window.innerHeight / lay.h);
  stageEl.style.setProperty('--scale', String(s));
  fx.resize(s);
  stage.resize(s);
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => window.setTimeout(fit, 150));
fit();

if (debug) (window as unknown as { __wb: Game }).__wb = game;
