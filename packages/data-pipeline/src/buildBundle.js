import fs from 'fs-extra';
import { join } from 'path';
import { createHash } from 'crypto';
import { zipSync, strToU8, ZipOptions } from 'fflate';
import Papa from 'papaparse';

export async function buildBundle({ inputDir, outDir }) {
  await fs.ensureDir(outDir);

  function read(name){
    const p = new URL(name, inputDir);
    return fs.readFile(p, 'utf8').then(t => Papa.parse(t, { header: true, dynamicTyping: true, skipEmptyLines: true }).data);
  }

  const filesToRead = [
    'players.csv','teams.csv','awards.csv','eligibility.csv','daily_picks.csv','aliases.csv',
    'position_seasons_qb.csv','position_seasons_rb.csv','position_seasons_wr.csv','position_seasons_te.csv'
  ];

  let csvs = {};
  for (const f of filesToRead) {
    try {
      csvs[f] = await read(f);
    } catch (e) {
      throw new Error('Missing input CSVs in packages/data-pipeline/input/. ' + e.message);
    }
  }

  const players = csvs['players.csv']; const teams = csvs['teams.csv']; const awards = csvs['awards.csv'];
  const eligibility = csvs['eligibility.csv']; const daily_picks = csvs['daily_picks.csv']; const aliases = csvs['aliases.csv'];
  const qb = csvs['position_seasons_qb.csv']; const rb = csvs['position_seasons_rb.csv']; const wr = csvs['position_seasons_wr.csv']; const te = csvs['position_seasons_te.csv'];

  // Minimal placeholders (your full TS pipeline computes real values offline)
  const percentiles = {};
  const ig = {};
  const packs = { "100001": (players||[]).slice(0,10).map(p=>p.id || 1) };

  const files = {};
  function addJson(name, obj) { files[name] = strToU8(JSON.stringify(obj)); }
  function addCsv(name, arr) { files[name] = strToU8(Papa.unparse(arr)); }

  for (const k of Object.keys(csvs)) addCsv(k, csvs[k]);
  addJson('percentiles.json', percentiles);
  addJson('ig_tables.json', ig);
  addJson('difficulty_index.json', {});
  addJson('packs.json', packs);

  const hashes = {};
  for (const [name, bytes] of Object.entries(files)) {
    const h = createHash('sha256').update(bytes).digest('hex');
    hashes[name] = h;
  }
  addJson('schema_hashes.json', hashes);

  const z = zipSync(files, { level: 9 });
  await fs.ensureDir(outDir);
  await fs.writeFile(join(outDir.pathname ? outDir.pathname : outDir.toString(), 'glide-data-bundle.zip'), Buffer.from(z));
  console.log('Built glide-data-bundle.zip');
}
