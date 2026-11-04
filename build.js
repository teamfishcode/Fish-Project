const fs = require("fs");
const path = require("path");
const { Cite, plugins } = require("@citation-js/core");

require("@citation-js/plugin-bibtex");
require("@citation-js/plugin-csl");

// --------------------------------------------------
// SETTINGS
// --------------------------------------------------

const root = process.cwd();
const output = path.join(root, "_site");

const styleName = "aip";
const bibPath = path.join(root, "references.bib");
const cslPath = path.join(root, "american-institute-of-physics.csl");

// --------------------------------------------------
// CHECK FILES
// --------------------------------------------------

if (!fs.existsSync(bibPath)) {
  throw new Error("Missing references.bib");
}

if (!fs.existsSync(cslPath)) {
  throw new Error("Missing american-institute-of-physics.csl");
}

// --------------------------------------------------
// LOAD AIP CITATION STYLE
// --------------------------------------------------

const style = fs.readFileSync(cslPath, "utf8");

plugins.config.get("@csl").templates.add(styleName, style);

// --------------------------------------------------
// LOAD BIBLIOGRAPHY
// --------------------------------------------------

const bib = new Cite(fs.readFileSync(bibPath, "utf8"));

const entries = new Map(
  bib.data.map(item => [item.id, item])
);

console.log(`Loaded ${entries.size} bibliography entries.`);

// --------------------------------------------------
// PROCESS INDIVIDUAL HTML PAGES
// --------------------------------------------------

function processHtml(html, fileName) {

  // Find empty citation spans.
  const citationPattern = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;

  const citedKeys = [];

  // Collect citations in order of appearance.
  for (const match of html.matchAll(citationPattern)) {

    const attributes = match[1];
    const content = match[2];

    const citeAttribute = attributes.match(
      /\bdata-cite\s*=\s*(["'])(.*?)\1/i
    );

    if (!citeAttribute) continue;

    // Only process empty citation placeholders.
    if (content.trim() !== "") continue;

    const key = citeAttribute[2].trim();

    if (!entries.has(key)) {
      throw new Error(
        `Citation "${key}" in ${fileName} is missing from references.bib`
      );
    }

    // Avoid adding the same reference more than once.
    if (!citedKeys.includes(key)) {
      citedKeys.push(key);
    }
  }

  // No citations on this page: leave it unchanged.
  if (citedKeys.length === 0) {
    return html;
  }

  console.log(
    `Processing ${fileName}: ${citedKeys.length} unique citations.`
  );

  // ------------------------------------------------
  // GENERATE NUMBERED IN-TEXT CITATIONS
  // ------------------------------------------------

  html = html.replace(citationPattern, (original, attributes, content) => {

    const citeAttribute = attributes.match(
      /\bdata-cite\s*=\s*(["'])(.*?)\1/i
    );

    if (!citeAttribute || content.trim() !== "") {
      return original;
    }

    const key = citeAttribute[2].trim();
    const number = citedKeys.indexOf(key) + 1;

    return `[${number}]`;
  });

  // ------------------------------------------------
  // GENERATE AIP BIBLIOGRAPHY
  // ------------------------------------------------

  const citedEntries = new Cite(
    citedKeys.map(key => entries.get(key))
  );

  const references = citedEntries.format("bibliography", {
    format: "html",
    template: styleName,
    lang: "en-GB"
  });

  // ------------------------------------------------
  // INSERT REFERENCES SECTION
  // ------------------------------------------------

  const referencesPattern =
    /<div\b(?=[^>]*\bid\s*=\s*(["'])references\1)[^>]*>[\s\S]*?<\/div>/i;

  if (referencesPattern.test(html)) {

    // Use an existing references placeholder.
    html = html.replace(
      referencesPattern,
      `<div id="references">\n${references}\n</div>`
    );

  } else {

    // Automatically add a references section.
    const referencesSection = `
<h2>References</h2>
<div id="references">
${references}
</div>
`;

    if (/<\/body>/i.test(html)) {

      html = html.replace(
        /<\/body>/i,
        `${referencesSection}\n</body>`
      );

    } else {

      html += referencesSection;

    }
  }

  return html;
}

// --------------------------------------------------
// COPY WEBSITE AND PROCESS ALL HTML FILES
// --------------------------------------------------

function copySite(source, destination) {

  fs.mkdirSync(destination, { recursive: true });

  for (const item of fs.readdirSync(source, {
    withFileTypes: true
  })) {

    // Ignore folders that should not be published.
    if (
      item.isDirectory() &&
      [
        ".git",
        ".github",
        "node_modules",
        "_site"
      ].includes(item.name)
    ) {
      continue;
    }

    const from = path.join(source, item.name);
    const to = path.join(destination, item.name);

    if (item.isDirectory()) {

      copySite(from, to);

    } else if (item.isFile()) {

      if (
        [
          "package.json",
          "package-lock.json",
          "build.js"
        ].includes(item.name)
      ) {
        continue;
      }

      // Process every HTML file.
      if (item.name.toLowerCase().endsWith(".html")) {

        const html = fs.readFileSync(from, "utf8");

        const processedHtml = processHtml(
          html,
          path.relative(root, from)
        );

        fs.writeFileSync(to, processedHtml, "utf8");

      } else {

        // Copy images, CSS, JavaScript and other files unchanged.
        fs.copyFileSync(from, to);

      }
    }
  }
}

// --------------------------------------------------
// BUILD WEBSITE
// --------------------------------------------------

console.log("Starting website build...");

// Remove previous build.
fs.rmSync(output, {
  recursive: true,
  force: true
});

// Create fresh output directory.
fs.mkdirSync(output, {
  recursive: true
});

// Copy and process website.
copySite(root, output);

// --------------------------------------------------
// FINISHED
// --------------------------------------------------

console.log("-----------------------------------");
console.log("Website build completed successfully!");
console.log("All HTML pages have been processed.");
console.log("AIP references have been generated.");
console.log("Output folder: _site");
console.log("-----------------------------------");
