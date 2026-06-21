// Flattens a Tiled `.tmj` map + its external `.tsx` tilesets into a single
// self-contained manifest plus the *subset* of tileset images the map actually
// uses, written under `public/assets/map/`. Because everything lands in
// `public/`, Vite serves it in dev and copies it into `dist/` on build — one
// code path, no dev/build divergence — while the bulky source pack under the
// gitignored `vendor-assets/` stays out of the repo.
//
// Run: `node scripts/build-map-assets.mjs` (or `npm run map:build`). Re-run only
// when `Sample map.tmj` (or its tilesets) change; the output is committed.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, resolve, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const TMJ_PATH = resolve(ROOT, "public/assets/Sample map.tmj");
const OUT_DIR = resolve(ROOT, "public/assets/map");
const OUT_IMG_DIR = resolve(OUT_DIR, "img");
const MANIFEST_PATH = resolve(OUT_DIR, "sample-map.json");

// Tiled stores per-tile flip state in the top 3 gid bits; mask them to get the
// real tile id. We only carry the flags through for object sprites.
const FLIP_MASK = 0x1fffffff;

/** Read a single XML attribute value, e.g. attr('a="b"', "a") -> "b". */
function attr(xml, name) {
  const match = xml.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : undefined;
}

/** Parse a `.tsx` tileset into either a spritesheet or an image-collection descriptor. */
function parseTsx(tsxPath) {
  const xml = readFileSync(tsxPath, "utf8");
  const tilesetTag = xml.match(/<tileset[^>]*>/)[0];
  const columns = Number(attr(tilesetTag, "columns") ?? "0");
  const tilewidth = Number(attr(tilesetTag, "tilewidth"));
  const tileheight = Number(attr(tilesetTag, "tileheight"));
  const tsxDir = dirname(tsxPath);

  if (columns > 0) {
    // Spritesheet: one image, a regular grid of `columns` wide.
    const imageTag = xml.match(/<image[^>]*\/?>/)[0];
    return {
      kind: "sheet",
      tilewidth,
      tileheight,
      columns,
      tilecount: Number(attr(tilesetTag, "tilecount")),
      margin: Number(attr(tilesetTag, "margin") ?? "0"),
      spacing: Number(attr(tilesetTag, "spacing") ?? "0"),
      imagewidth: Number(attr(imageTag, "width")),
      imageheight: Number(attr(imageTag, "height")),
      imagePath: resolve(tsxDir, attr(imageTag, "source"))
    };
  }

  // Image collection: one `<image>` per `<tile id>`.
  const tiles = {};
  const tileRe = /<tile id="(\d+)">\s*<image([^>]*)\/?>/g;
  let m;
  while ((m = tileRe.exec(xml)) !== null) {
    const localId = Number(m[1]);
    const imgAttrs = m[2];
    tiles[localId] = {
      width: Number(attr(imgAttrs, "width")),
      height: Number(attr(imgAttrs, "height")),
      imagePath: resolve(tsxDir, attr(imgAttrs, "source"))
    };
  }
  return { kind: "collection", tilewidth, tileheight, tiles };
}

function sanitizeName(srcPath, used) {
  const ext = extname(srcPath);
  let base = basename(srcPath, ext).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let name = `${base}${ext}`;
  let n = 1;
  while (used.has(name)) {
    name = `${base}-${n}${ext}`;
    n += 1;
  }
  used.add(name);
  return name;
}

function main() {
  const tmj = JSON.parse(readFileSync(TMJ_PATH, "utf8"));

  // 1. Resolve every referenced tileset (firstgid + parsed .tsx), sorted by firstgid.
  const tilesets = tmj.tilesets
    .map((ts) => ({ firstgid: ts.firstgid, ...parseTsx(resolve(dirname(TMJ_PATH), ts.source)) }))
    .sort((a, b) => a.firstgid - b.firstgid);

  const tilesetForGid = (gid) => {
    let chosen;
    for (const ts of tilesets) {
      if (ts.firstgid <= gid) chosen = ts;
      else break;
    }
    return chosen;
  };

  // 2. Collect every gid the map actually uses (flip bits stripped).
  const usedGids = new Set();
  for (const layer of tmj.layers) {
    if (layer.type === "tilelayer") {
      for (const raw of layer.data) {
        const gid = raw & FLIP_MASK;
        if (gid !== 0) usedGids.add(gid);
      }
    } else if (layer.type === "objectgroup") {
      for (const obj of layer.objects) {
        if (obj.gid) usedGids.add(obj.gid & FLIP_MASK);
      }
    }
  }

  // 3. Decide which images to copy: whole sheets that are touched, plus the
  //    individual collection members that are referenced.
  const usedTilesets = new Set();
  const usedCollectionTiles = new Map(); // tileset -> Set<localId>
  for (const gid of usedGids) {
    const ts = tilesetForGid(gid);
    if (!ts) continue;
    usedTilesets.add(ts);
    if (ts.kind === "collection") {
      if (!usedCollectionTiles.has(ts)) usedCollectionTiles.set(ts, new Set());
      usedCollectionTiles.get(ts).add(gid - ts.firstgid);
    }
  }

  // 4. Copy images and remember their public names.
  rmSync(OUT_IMG_DIR, { recursive: true, force: true });
  mkdirSync(OUT_IMG_DIR, { recursive: true });
  const usedNames = new Set();
  const nameFor = new Map(); // absolute src path -> "img/<name>"
  let bytes = 0;
  const copyImage = (srcPath) => {
    if (nameFor.has(srcPath)) return nameFor.get(srcPath);
    const name = sanitizeName(srcPath, usedNames);
    copyFileSync(srcPath, resolve(OUT_IMG_DIR, name));
    bytes += readFileSync(srcPath).byteLength;
    const rel = `img/${name}`;
    nameFor.set(srcPath, rel);
    return rel;
  };

  // 5. Build the manifest's tilesets (only the used ones; collections trimmed).
  const manifestTilesets = [];
  for (const ts of tilesets) {
    if (!usedTilesets.has(ts)) continue;
    if (ts.kind === "sheet") {
      manifestTilesets.push({
        firstgid: ts.firstgid,
        kind: "sheet",
        image: copyImage(ts.imagePath),
        imagewidth: ts.imagewidth,
        imageheight: ts.imageheight,
        columns: ts.columns,
        tilecount: ts.tilecount,
        tilewidth: ts.tilewidth,
        tileheight: ts.tileheight,
        margin: ts.margin,
        spacing: ts.spacing
      });
    } else {
      const tiles = {};
      for (const localId of usedCollectionTiles.get(ts) ?? []) {
        const t = ts.tiles[localId];
        if (!t) continue;
        tiles[localId] = { image: copyImage(t.imagePath), width: t.width, height: t.height };
      }
      manifestTilesets.push({ firstgid: ts.firstgid, kind: "collection", tilewidth: ts.tilewidth, tileheight: ts.tileheight, tiles });
    }
  }

  // 6. Carry the layers across in render order (Tiled lists them bottom-to-top).
  const layers = tmj.layers
    .filter((l) => l.type === "tilelayer" || l.type === "objectgroup")
    .map((l) => {
      if (l.type === "tilelayer") {
        return { kind: "tilelayer", name: l.name, data: l.data };
      }
      return {
        kind: "objectgroup",
        name: l.name,
        draworder: l.draworder ?? "topdown",
        objects: l.objects.map((o) => ({ gid: o.gid, x: o.x, y: o.y, width: o.width, height: o.height }))
      };
    });

  const manifest = {
    width: tmj.width,
    height: tmj.height,
    tilewidth: tmj.tilewidth,
    tileheight: tmj.tileheight,
    tilesets: manifestTilesets,
    layers
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest));

  const imageCount = nameFor.size;
  console.log(`Wrote ${MANIFEST_PATH}`);
  console.log(`Copied ${imageCount} images (${(bytes / 1024 / 1024).toFixed(2)} MB) to ${OUT_IMG_DIR}`);
  console.log(`Tilesets: ${manifestTilesets.length}, layers: ${layers.length}, used gids: ${usedGids.size}`);
}

main();
