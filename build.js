
const fs = require("fs");
const path = require("path");
const { Cite, plugins } = require("@citation-js/core");

require("@citation-js/plugin-bibtex");
require("@citation-js/plugin-csl");

const root = process.cwd();
const output = path.join(root, "_site");
const styleName = "aip";
const bibPath = path.join(root, "references.bib");
const cslPath = path.join(root, "american-institute-of-physics.csl");

if (!fs.existsSync(bibPath) || !fs.existsSync(cslPath)) {
  throw new Error("Missing references.bib or AIP CSL style file.");
}

const style = fs.readFileSync(cslPath, "utf8");
plugins.config.get("@csl").templates.add(styleName, style);

const bib = new Cite(fs.readFileSync(bibPath, "utf8"));
const entries = new Map(bib.data.map(item => [item.id, item]));

let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const citationPattern = /<span\b[^>]*data-cite="([^"]+)"[^>]*><\/span>/g;

const citedKeys = [];
for (const match of html.matchAll(citationPattern)) {
  const key = match[1].trim();
  if (!entries.has(key)) {
    throw new Error(`Citation "${key}" is missing from references.bib`);
  }
  if (!citedKeys.includes(key)) citedKeys.push(key);
}

html = html.replace(citationPattern, (_, key) =>
  `[${citedKeys.indexOf(key.trim()) + 1}]`
);

const references = citedKeys.map((key, index) => {
  const entry = new Cite([entries.get(key)]);
  const rendered = entry.format("bibliography", {
    format: "html",
    template: styleName,
    lang: "en-GB"
  });

  const match = rendered.match(
    /<div class="csl-entry"[^>]*>([\s\S]*?)<\/div>/
  );

  if (!match) {
    throw new Error(`Could not format reference "${key}"`);
  }

  return `<li value="${index + 1}">${match[1]}</li>`;
}).join("\n");

if (!html.includes('<div id="references"></div>')) {
  throw new Error('Add <div id="references"></div> to index.html');
}

html = html.replace(
  '<div id="references"></div>',
  `<ol id="references">\n${references}\n</ol>`
);

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

function copySite(source, destination) {
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    if ([".git", ".github", "node_modules", "_site"].includes(item.name)) {
      continue;
    }

    const from = path.join(source, item.name);
    const to = path.join(destination, item.name);

    if (item.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copySite(from, to);
    } else if (
      !["package.json", "package-lock.json", "build.js"].includes(item.name)
    ) {
      fs.copyFileSync(from, to);
    }
  }
}

copySite(root, output);
fs.writeFileSync(path.join(output, "index.html"), html);

console.log("Website and AIP references generated successfully.");
