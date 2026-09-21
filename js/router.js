/* Hash router: "#/diary/2026-09-21/edit?x=1" → { path: ['diary','2026-09-21','edit'], query } */

export function parseHash(hash = location.hash) {
  const [p, q] = hash.replace(/^#\/?/, '').split('?');
  return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
}
/** Navigate; re-dispatch when already there (hashchange wouldn't fire). */
export function go(hash, dispatch) { if (location.hash === hash) dispatch(); else location.hash = hash; }
/** True while the user is inside a form (don't re-render under their fingers). */
export const inForm = () => /\/(new|edit)(\?|$)/.test(location.hash) || /^#\/(settings|reviews\/)/.test(location.hash);
