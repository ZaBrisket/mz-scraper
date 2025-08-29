export type SiteProfile = { origin: string; link_selector: string; next_button_text: string; updated_at: string; };
const KEY = 'mz_site_profiles';
export function loadProfiles(): SiteProfile[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveProfile(p: SiteProfile) {
  const list = loadProfiles();
  const i = list.findIndex(x => x.origin === p.origin);
  if (i >= 0) list[i] = p; else list.push(p);
  localStorage.setItem(KEY, JSON.stringify(list));
}
export function findProfile(origin: string) { return loadProfiles().find(p => p.origin === origin); }
