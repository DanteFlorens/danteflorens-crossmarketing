/** Чтение вложений Факела: любой вид файла → текст/сводка для ядра. */

const TEXT_EXT = new Set([
  "txt", "csv", "tsv", "json", "md", "markdown", "html", "htm", "xml", "svg",
  "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java",
  "kt", "c", "h", "cpp", "hpp", "cs", "php", "sql", "yml", "yaml", "toml", "ini",
  "log", "env", "rtf", "vcf", "ics", "tex",
]);

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"]);
const DOC_EXT = new Set(["pdf", "doc", "docx", "odt", "rtf"]);
const SHEET_EXT = new Set(["xls", "xlsx", "ods"]);
const MAX_FILES = 5;
const MAX_BYTES = 4_000_000;
const MAX_TEXT = 24_000;

function extOf(name = "") {
  const base = String(name).split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function cleanName(name) {
  return String(name || "file").replace(/[^\w.\-а-яА-ЯёЁ ]+/gi, "_").slice(0, 120);
}

function decodeBase64(data) {
  const raw = String(data || "").replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  return Buffer.from(raw, "base64");
}

function asText(buffer) {
  let text = buffer.toString("utf8");
  if (text.includes("\uFFFD")) text = buffer.toString("latin1");
  return text.replace(/\u0000/g, "").slice(0, MAX_TEXT);
}

function summarizeCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines.slice(0, 8).join("\n");
  return `CSV/таблица, строк ~${lines.length}.\nНачало:\n${head}`;
}

function summarizeJson(text) {
  try {
    const data = JSON.parse(text);
    const preview = JSON.stringify(data, null, 2).slice(0, 4000);
    return `JSON разобран.\n${preview}`;
  } catch {
    return `JSON-подобное (не строгий parse):\n${text.slice(0, 4000)}`;
  }
}

function extractPdfText(buffer) {
  const raw = buffer.toString("latin1");
  const chunks = [];
  const re = /\((?:\\.|[^\\)]){2,200}\)/g;
  let match;
  while ((match = re.exec(raw)) && chunks.length < 400) {
    const piece = match[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-zА-Яа-я0-9]/.test(piece)) chunks.push(piece);
  }
  const streamBits = [];
  const streamRe = /stream([\s\S]{0,8000}?)endstream/gi;
  while ((match = streamRe.exec(raw)) && streamBits.length < 20) {
    const bit = match[1].replace(/[^\x09\x0A\x0D\x20-\x7EА-Яа-яЁё]/g, " ").replace(/\s+/g, " ").trim();
    if (bit.length > 40) streamBits.push(bit.slice(0, 500));
  }
  const text = [...chunks, ...streamBits].join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  if (!text) {
    return {
      kind: "pdf",
      readable: false,
      summary: "PDF получен. Текстовый слой почти не извлечён (возможно скан). Опиши, что внутри, или пришли текстовую выгрузку.",
      text: "",
    };
  }
  return {
    kind: "pdf",
    readable: true,
    summary: `PDF, извлечено ~${text.length} знаков текста.`,
    text,
  };
}

function readBinaryMeta(buffer, name, mime) {
  return {
    kind: "binary",
    readable: false,
    summary: `Файл «${name}» (${mime || "binary"}, ${buffer.length} байт). Содержимое бинарное — я вижу метаданные. Для разбора пришли текст/CSV/JSON или опиши задачу по файлу.`,
    text: "",
  };
}

export function readAttachment(file) {
  const name = cleanName(file?.name || file?.filename || "file");
  const mime = String(file?.mime || file?.type || "application/octet-stream").slice(0, 120);
  const ext = extOf(name) || extOf(mime);
  let buffer;
  try {
    buffer = decodeBase64(file?.data || file?.content || "");
  } catch {
    return { name, mime, ext, kind: "error", readable: false, summary: `Не удалось прочитать «${name}».`, text: "", bytes: 0 };
  }
  if (!buffer.length) {
    return { name, mime, ext, kind: "empty", readable: false, summary: `Файл «${name}» пустой.`, text: "", bytes: 0 };
  }
  if (buffer.length > MAX_BYTES) {
    return {
      name,
      mime,
      ext,
      kind: "too_large",
      readable: false,
      summary: `«${name}» слишком большой (${buffer.length} байт). Лимит ${MAX_BYTES}.`,
      text: "",
      bytes: buffer.length,
    };
  }

  if (TEXT_EXT.has(ext) || mime.startsWith("text/") || mime.includes("json") || mime.includes("xml") || mime.includes("javascript")) {
    const text = asText(buffer);
    let summary = `Текст «${name}», ${text.length} знаков.`;
    let body = text;
    if (ext === "csv" || ext === "tsv") {
      summary = `«${name}»: ${summarizeCsv(text)}`;
      body = text;
    } else if (ext === "json") {
      summary = `«${name}»: ${summarizeJson(text)}`;
      body = text;
    }
    return { name, mime, ext, kind: "text", readable: true, summary, text: body.slice(0, MAX_TEXT), bytes: buffer.length };
  }

  if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
    return {
      name,
      mime,
      ext,
      kind: "image",
      readable: true,
      summary: `Изображение «${name}» (${mime || ext}, ${buffer.length} байт). Вижу файл; без внешнего vision-LLM не разбираю пиксели попиксельно — опиши, что на картинке, или задай вопрос по смыслу вложения.`,
      text: "",
      bytes: buffer.length,
      imageBase64: buffer.toString("base64").slice(0, 200_000),
    };
  }

  if (ext === "pdf" || mime.includes("pdf")) {
    const pdf = extractPdfText(buffer);
    return { name, mime, ext, bytes: buffer.length, ...pdf, summary: `«${name}»: ${pdf.summary}`, text: pdf.text };
  }

  if (DOC_EXT.has(ext) || SHEET_EXT.has(ext)) {
    const sniff = asText(buffer).replace(/[^\x09\x0A\x0D\x20-\x7EА-Яа-яЁё]/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
    return {
      name,
      mime,
      ext,
      kind: SHEET_EXT.has(ext) ? "sheet" : "document",
      readable: Boolean(sniff),
      summary: sniff
        ? `«${name}» (${ext}): извлечён обрывок текста из контейнера.\n${sniff.slice(0, 800)}`
        : `«${name}» — офисный формат. Для точного чтения лучше CSV/TXT/JSON выгрузка.`,
      text: sniff,
      bytes: buffer.length,
    };
  }

  const meta = readBinaryMeta(buffer, name, mime);
  return { name, mime, ext, bytes: buffer.length, ...meta };
}

export function readAttachments(files) {
  const list = Array.isArray(files) ? files.slice(0, MAX_FILES) : [];
  const read = list.map(readAttachment);
  const digest = read.map((item, i) => {
    const body = item.text ? `\n---\n${item.text.slice(0, 8000)}` : "";
    return `[Файл ${i + 1}] ${item.summary}${body}`;
  }).join("\n\n");
  return {
    files: read.map(({ name, mime, ext, kind, readable, summary, bytes }) => ({
      name, mime, ext, kind, readable, summary, bytes,
    })),
    digest: digest.slice(0, 60_000),
    count: read.length,
  };
}

export const FAKEL_FILE_LIMITS = { MAX_FILES, MAX_BYTES, MAX_TEXT };
