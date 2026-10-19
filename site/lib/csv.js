// Reads a user's projections CSV into the player shape the engine expects.
// Accepts the column names common projection sites export, per-game values.

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

// Header aliases, compared after lower-casing and stripping spaces, dots and underscores.
const ALIASES = {
  name: ['name', 'player', 'playername', 'fullname'],
  team: ['team', 'tm', 'nbateam'],
  pos: ['pos', 'position', 'positions', 'elig'],
  gp: ['gp', 'g', 'games'],
  mpg: ['mpg', 'min', 'mp', 'minutes'],
  fgm: ['fgm', 'fg'],
  fga: ['fga'],
  fgpct: ['fg%', 'fgpct', 'fgpercent'],
  ftm: ['ftm', 'ft'],
  fta: ['fta'],
  ftpct: ['ft%', 'ftpct', 'ftpercent'],
  tpm: ['3pm', '3ptm', '3p', 'fg3m', 'fg3', 'threes', '3pt'],
  pts: ['pts', 'points'],
  reb: ['reb', 'trb', 'rebounds', 'treb'],
  ast: ['ast', 'assists'],
  stl: ['stl', 'steals', 'st'],
  blk: ['blk', 'blocks'],
  tov: ['to', 'tov', 'turnovers'],
};
const norm = (h) => h.toLowerCase().replace(/[\s._]/g, '');
const REQUIRED = ['name', 'fga', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov'];

const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function projectionsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { players: [], errors: ['The file has no data rows.'] };
  const header = rows[0].map(norm);
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) col[key] = i;
  }
  const missing = REQUIRED.filter((k) => col[k] === undefined);
  if (col.fgm === undefined && col.fgpct === undefined) missing.push('fgm or fg%');
  if (col.ftm === undefined && col.ftpct === undefined) missing.push('ftm or ft%');
  if (missing.length) return { players: [], errors: [`Missing columns: ${missing.join(', ')}.`] };

  const players = [];
  const errors = [];
  const ids = new Set();
  const pct = (v) => (v > 1 ? v / 100 : v); // accept 47.5 or .475
  rows.slice(1).forEach((r, n) => {
    const get = (k) => (col[k] === undefined ? undefined : r[col[k]]?.trim() ?? '');
    const num = (k) => Number(get(k));
    const name = get('name');
    if (!name) return;
    const p = {
      name,
      team: get('team') ?? '',
      pos: get('pos') ?? '',
      gp: col.gp === undefined ? 82 : num('gp'),
      mpg: col.mpg === undefined ? 0 : num('mpg'),
      fga: num('fga'), fta: num('fta'), tpm: num('tpm'), pts: num('pts'), reb: num('reb'),
      ast: num('ast'), stl: num('stl'), blk: num('blk'), tov: num('tov'),
    };
    p.fgm = col.fgm !== undefined ? num('fgm') : pct(num('fgpct')) * p.fga;
    p.ftm = col.ftm !== undefined ? num('ftm') : pct(num('ftpct')) * p.fta;
    const bad = Object.entries(p).find(([k, v]) => typeof v === 'number' && !Number.isFinite(v));
    if (bad) { errors.push(`Row ${n + 2} (${name}): "${bad[0]}" is not a number.`); return; }
    let id = `csv-${slug(name)}`;
    while (ids.has(id)) id += '-2';
    ids.add(id);
    players.push({ id, ...p });
  });
  return { players, errors };
}
