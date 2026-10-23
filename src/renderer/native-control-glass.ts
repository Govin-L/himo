import type { ControlGlassLayout } from '../shared/types';

// A transition that only moves a control (the player dropping into the tab row) never resizes it,
// so observers alone would leave its glass behind mid-way.
function controlsMoving(): boolean {
  return document.getAnimations().some(animation => {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    return animation.playState === 'running' && !!target?.closest('.dock, .global-search');
  });
}

// The DOM owns layout. Native glass is a projection of these existing controls.
export function startNativeControlGlass(): void {
  if (!navigator.userAgent.includes('Macintosh')) return;
  let frame = 0;
  let lastLayout = '';
  let watched: Element[] = [];
  const resize = new ResizeObserver(() => schedule());
  const rectangle = (element: Element | null) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!rect.width || !rect.height || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  };
  const synchronize = async () => {
    frame = 0;
    const player = document.querySelector('.player');
    const tabs = document.querySelector('.bottom-nav');
    const search = document.querySelector('.global-search');
    const targets = [document.documentElement, player, tabs, search].filter((node): node is Element => !!node);
    for (const old of watched) if (!targets.includes(old)) resize.unobserve(old);
    for (const target of targets) if (!watched.includes(target)) resize.observe(target);
    watched = targets;
    const layout: ControlGlassLayout = { player: rectangle(player), tabs: rectangle(tabs), search: rectangle(search) };
    // Follow folding transitions frame by frame, including their delay before anything moves.
    if (controlsMoving()) schedule();
    const key = JSON.stringify(layout);
    if (key === lastLayout) return;
    lastLayout = key;
    try {
      const result = await window.desktop.window.syncGlassControls(layout);
      if (lastLayout === key) document.documentElement.classList.toggle('native-control-glass', result.ok && result.data.active);
    } catch {
      document.documentElement.classList.remove('native-control-glass');
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { void synchronize(); }); };
  const mutations = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || record.target === document.documentElement
      || watched.includes(record.target as Element) || (record.target as Element).classList?.contains('app-shell'))) schedule();
  });
  mutations.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  window.addEventListener('resize', schedule);
  void document.fonts.ready.then(schedule);
  schedule();
  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
    window.removeEventListener('resize', schedule);
  }, { once: true });
}
