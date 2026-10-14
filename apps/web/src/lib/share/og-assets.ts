import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Fonts and the A-mark logo for the rank card images, bundled in the repo (no runtime download):
 * Inter (SIL Open Font License 1.1, see _assets/Inter-OFL.txt) in WOFF form from @fontsource/inter,
 * latin + latin-ext subsets, and a 256px copy of public/icons/icon-512.png.
 *
 * The files live in src/app/api/og/_assets and are listed in next.config.mjs
 * `outputFileTracingIncludes` so they ship with the serverless function (Vercel) and the
 * standalone build (Docker). `next start` / Vercel run with cwd = apps/web; tests run from the
 * monorepo root, hence the second candidate.
 */
const ASSET_DIR_CANDIDATES = [
  path.join(process.cwd(), 'src', 'app', 'api', 'og', '_assets'),
  path.join(process.cwd(), 'apps', 'web', 'src', 'app', 'api', 'og', '_assets'),
];

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 500 | 700 | 900;
  style: 'normal';
}

export interface OgAssets {
  fonts: OgFont[];
  /** data:image/png;base64,… */
  logo: string;
}

const FONT_FILES: Array<{ file: string; weight: OgFont['weight'] }> = [
  { file: 'inter-latin-500-normal.woff', weight: 500 },
  { file: 'inter-latin-700-normal.woff', weight: 700 },
  { file: 'inter-latin-900-normal.woff', weight: 900 },
  { file: 'inter-latin-ext-500-normal.woff', weight: 500 },
  { file: 'inter-latin-ext-700-normal.woff', weight: 700 },
  { file: 'inter-latin-ext-900-normal.woff', weight: 900 },
];

async function readAsset(name: string): Promise<Buffer> {
  let lastError: unknown;
  for (const dir of ASSET_DIR_CANDIDATES) {
    try {
      return await readFile(path.join(dir, name));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`og asset not found: ${name}`);
}

const toArrayBuffer = (buf: Buffer): ArrayBuffer => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

let cached: Promise<OgAssets> | null = null;

/** Loads (once per server instance) the fonts and logo used by every card image. */
export function loadOgAssets(): Promise<OgAssets> {
  if (!cached) {
    cached = (async () => {
      const [logo, ...fonts] = await Promise.all([readAsset('logo-256.png'), ...FONT_FILES.map((f) => readAsset(f.file))]);
      return {
        logo: `data:image/png;base64,${logo.toString('base64')}`,
        fonts: fonts.map((data, i) => ({ name: 'Inter', data: toArrayBuffer(data), weight: FONT_FILES[i].weight, style: 'normal' as const })),
      };
    })();
    // A failed read (e.g. a missing file) must not be cached forever.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
