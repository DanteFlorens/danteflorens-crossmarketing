import { normalize } from "./ontology.js";

function splitCsvLine(line, delim) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === delim && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const delim = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const head = splitCsvLine(lines[0], delim).map((cell) => normalize(cell));
  const headerish = head.some((cell) =>
    ["имя", "name", "контакт", "email", "телефон", "заметка", "траты", "город", "spend"].includes(cell),
  );
  const rows = headerish ? lines.slice(1) : lines;
  return rows
    .map((line) => {
      const cells = splitCsvLine(line, delim);
      const spend = Number(String(cells[3] || "0").replace(/\s/g, "").replace(",", ".")) || 0;
      return {
        name: cells[0] || "Без имени",
        contact: cells[1] || "",
        note: cells[2] || "",
        spend,
        city: cells[4] || "",
      };
    })
    .filter((row) => row.name && row.name !== "Без имени" || row.contact);
}
