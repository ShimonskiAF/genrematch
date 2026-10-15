// Folder (rekordbox crate) -> expected family and subgenre profile id. Her DJ intent, not a hard truth.
export const LABELS = {
  'Speed House': { family: 'House', sub: 'speedhouse' },
  'Bass House': { family: 'House', sub: 'basshouse' },
  'Tech House': { family: 'House', sub: 'techhouse' },
  'Peak Time Techno': { family: 'Techno', sub: 'peaktechno' },
  'Hip Hop': { family: 'Rap', sub: 'hiphop' },
  'Open Format Mashups': { family: 'Rap', sub: null },
  'DnB': { family: "Drum 'n' Bass", sub: 'dnb' },
  'Moombahton': { family: 'House', sub: 'moombahton' },
  'Reggaeton': { family: 'Jamaican', sub: 'reggaeton' },
};
export const labelFor = (folder) => { const leaf = folder.split('/').at(-1).replace(/^\d+\s+/, ''); return { crate: leaf, ...LABELS[leaf] }; };
// ~30% held out, stratified, chosen before fitting (fixed for reproducibility).
export const HOLDOUT = [/^Kendrick/, /^Poto Rico/, /^Lady Bee/, /^Joe Budden/, /^Comet/, /^Rudimental/, /^J Balvin/, /CA7RIEL.*NICO/];
export const isHeldOut = (file) => HOLDOUT.some((r) => r.test(file));
