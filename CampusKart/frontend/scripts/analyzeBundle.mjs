import { gzipSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";

const BUDGET_GZIP_BYTES = 200 * 1024;
const SHOULD_ASSERT = process.argv.includes("--assert");

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function fileSizeWithGzip(filePath) {
  const content = await fs.readFile(filePath);
  return {
    rawBytes: content.byteLength,
    gzipBytes: gzipSync(content).byteLength,
  };
}

function pickEntryManifestKey(manifest) {
  if (manifest["index.html"]) {
    return "index.html";
  }

  const keys = Object.keys(manifest);
  const explicitEntry = keys.find((key) => manifest[key]?.isEntry);
  if (explicitEntry) {
    return explicitEntry;
  }

  return null;
}

function collectStaticChain(manifest, key, visitedKeys = new Set()) {
  if (!key || visitedKeys.has(key) || !manifest[key]) {
    return visitedKeys;
  }

  visitedKeys.add(key);
  const imports = manifest[key].imports || [];
  imports.forEach((importKey) => collectStaticChain(manifest, importKey, visitedKeys));
  return visitedKeys;
}

async function main() {
  const frontendRoot = process.cwd();
  const distDir = path.join(frontendRoot, "dist");
  const manifestPath = path.join(distDir, ".vite", "manifest.json");

  const manifestRaw = await fs.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw);

  const entryKey = pickEntryManifestKey(manifest);
  if (!entryKey) {
    throw new Error("Could not find an entry in dist/.vite/manifest.json");
  }

  const staticKeys = Array.from(collectStaticChain(manifest, entryKey));
  const staticFiles = staticKeys
    .map((key) => manifest[key]?.file)
    .filter(Boolean)
    .filter((file) => file.endsWith(".js"));

  const uniqueStaticFiles = Array.from(new Set(staticFiles));
  const jsFileStats = [];

  for (const relativeFile of uniqueStaticFiles) {
    const absoluteFile = path.join(distDir, relativeFile);
    const { rawBytes, gzipBytes } = await fileSizeWithGzip(absoluteFile);
    jsFileStats.push({
      file: relativeFile,
      rawBytes,
      gzipBytes,
    });
  }

  jsFileStats.sort((a, b) => b.gzipBytes - a.gzipBytes);

  const totalRawBytes = jsFileStats.reduce(
    (sum, item) => sum + safeNumber(item.rawBytes),
    0,
  );
  const totalGzipBytes = jsFileStats.reduce(
    (sum, item) => sum + safeNumber(item.gzipBytes),
    0,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    entryManifestKey: entryKey,
    budgetGzipBytes: BUDGET_GZIP_BYTES,
    totalRawBytes,
    totalGzipBytes,
    withinBudget: totalGzipBytes <= BUDGET_GZIP_BYTES,
    files: jsFileStats,
  };

  const reportJsonPath = path.join(distDir, "bundle-analysis.json");
  const reportTextPath = path.join(distDir, "bundle-analysis.txt");

  const textLines = [
    "CampusKart Frontend Bundle Analysis",
    `Generated: ${report.generatedAt}`,
    `Entry key: ${entryKey}`,
    "",
    "Public initial JS (entry + static shared imports):",
    `Raw total: ${formatKb(totalRawBytes)} (${totalRawBytes} bytes)`,
    `Gzip total: ${formatKb(totalGzipBytes)} (${totalGzipBytes} bytes)`,
    `Budget: ${formatKb(BUDGET_GZIP_BYTES)} (${BUDGET_GZIP_BYTES} bytes)`,
    `Budget status: ${report.withinBudget ? "PASS" : "FAIL"}`,
    "",
    "Files:",
    ...jsFileStats.map(
      (item) =>
        `- ${item.file}: raw ${formatKb(item.rawBytes)}, gzip ${formatKb(item.gzipBytes)}`,
    ),
    "",
  ];

  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(reportTextPath, `${textLines.join("\n")}\n`);

  console.log(textLines.join("\n"));
  console.log(`Saved ${path.relative(frontendRoot, reportJsonPath)}`);
  console.log(`Saved ${path.relative(frontendRoot, reportTextPath)}`);

  if (SHOULD_ASSERT && !report.withinBudget) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
