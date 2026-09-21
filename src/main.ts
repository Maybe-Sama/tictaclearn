import './style.css';
import { FLAGS_PACK } from './content/flags';
import { Game } from './game/Game';
import { Input } from './input/Input';
import { DebugPanel } from './ui/Debug';
import { Particles } from './ui/Particles';
import { CalibrationScreen, Menu, PauseOverlay, ResultsScreen } from './ui/Screens';
import { Stage } from './ui/Stage';

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const autoplay = debug ? params.get('autoplay') : null;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stageEl = document.getElementById('stage')!;
stageEl.innerHTML = `<div class="deco" aria-hidden="true">
  <i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i>
  <i class="spark s1">✦</i><i class="spark s2">✦</i><i class="spark s3">✦</i><i class="spark s4">✦</i>
</div>`;

const canvas = document.createElement('canvas');
canvas.className = 'fx';
const fx = new Particles(canvas, reduced);
const stage = new Stage(stageEl, FLAGS_PACK, fx, reduced);
stageEl.appendChild(canvas);
const menu = new Menu(stageEl, FLAGS_PACK);
const results = new ResultsScreen(stageEl, FLAGS_PACK);
const pause = new PauseOverlay(stageEl);
const calib = new CalibrationScreen(stageEl);

const game = new Game(FLAGS_PACK, { stage, menu, results, pause, calib, fx, debug: debug ? new DebugPanel() : null }, { debug, autoplay });
new Input(stageEl).on((a, ts) => game.onAction(a, ts));

function fit(): void {
  const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  stageEl.style.setProperty('--scale', String(s));
  fx.resize(s);
}
window.addEventListener('resize', fit);
fit();

if (debug) (window as unknown as { __wb: Game }).__wb = game;
