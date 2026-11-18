import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import { ensureCatalog } from "./catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FONT_PATH = path.join(root, "assets", "fonts", "Roboto-Regular.ttf");

function money(value) {
  const n = Math.round(Number(value) || 0);
  return `${new Intl.NumberFormat("ru-RU").format(n)} ₽`;
}

function when(iso) {
  if (!iso) return "дата не указана";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "дата не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function text(value, fallback = "не указано") {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function statusTitle(status) {
  if (status === "confirmed") return "подтверждена";
  if (status === "pending") return "ожидает подтверждения";
  return text(status, "статус неизвестен");
}

export function assertFont() {
  if (!fs.existsSync(FONT_PATH)) {
    const error = new Error(
      `Не найден кириллический шрифт: ${FONT_PATH}. Положите TTF по этому пути.`,
    );
    error.status = 500;
    throw error;
  }
  return FONT_PATH;
}

export function createPdfDoc() {
  const font = assertFont();
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: { Title: "Dante Florens", Author: "Dante Florens" },
  });
  doc.registerFont("Body", font);
  doc.font("Body");
  return doc;
}

export function buildDealPdf(deal, viewer) {
  const doc = createPdfDoc();
  const amount = Math.round(Number(deal?.amount) || 0);
  const fee = Number.isFinite(Number(deal?.fee))
    ? Math.round(Number(deal.fee))
    : Math.round(amount * 0.08);
  const net = Number.isFinite(Number(deal?.net)) ? Math.round(Number(deal.net)) : amount - fee;

  doc.fontSize(18).text("Dante Florens — акт по сделке", { align: "left" });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor("#444444").text(
    "Документ платформы обмена клиентами. Не является счётом-фактурой: реквизиты юрлица в контуре не хранятся.",
  );
  doc.fillColor("#000000");
  doc.moveDown();

  doc.fontSize(12);
  doc.text(`Номер: ${text(deal?.id, "без номера")}`);
  doc.text(`Статус: ${statusTitle(deal?.status)}`);
  doc.text(`Дата создания: ${when(deal?.at)}`);
  if (deal?.confirmedAt) doc.text(`Подтверждена: ${when(deal.confirmedAt)}`);
  doc.moveDown();

  doc.fontSize(13).text("Стороны");
  doc.fontSize(12);
  doc.text(`Продавец (получатель оплаты): ${text(deal?.sellerName, "сторона не указана")}`);
  doc.text(`Партнёр обмена: ${text(deal?.partnerName, "сторона не указана")}`);
  doc.text(`Клиент: ${text(deal?.clientName, "не указано")}`);
  if (deal?.clientContact) doc.text(`Контакт клиента: ${text(deal.clientContact)}`);
  if (deal?.bonus) {
    doc.moveDown(0.3);
    doc.text(`Бонус / акция: ${text(deal.bonus)}`);
  }
  doc.moveDown();

  doc.fontSize(13).text("Суммы");
  doc.fontSize(12);
  doc.text(`Сумма визита: ${money(amount)}`);
  doc.text(`Комиссия платформы (8%): ${money(fee)}`);
  doc.text(`К зачислению продавцу (92%): ${money(net)}`);
  doc.moveDown();

  if (viewer?.name) {
    doc.fontSize(10).fillColor("#444444").text(`Сформировано для: ${text(viewer.name)} · ${text(viewer.city, "")}`);
    doc.fillColor("#000000");
  }
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor("#666666").text(`Сформировано ${when(new Date().toISOString())}`);
  return doc;
}

export function buildCatalogPdf(business) {
  const catalog = ensureCatalog(business);
  if (!catalog.hook && !(catalog.chips || []).length) {
    const error = new Error("Заполните входную акцию или товары/услуги перед выгрузкой PDF.");
    error.status = 400;
    throw error;
  }

  const doc = createPdfDoc();
  doc.fontSize(18).text("Dante Florens — каталог", { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(12).text(text(business?.name, "Бизнес без названия"));
  doc.fontSize(10).fillColor("#444444").text(
    [business?.roleTitle || business?.craft, business?.city, business?.phone, business?.email]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(" · ") || "контакты не указаны",
  );
  doc.fillColor("#000000");
  doc.moveDown();

  if (catalog.hook) {
    doc.fontSize(13).text("Входная акция");
    doc.fontSize(12).text(text(catalog.hook.title));
    doc.text(
      catalog.hook.price > 0 ? `Цена: ${money(catalog.hook.price)}` : "Цена: по запросу",
    );
    if (catalog.hook.note) doc.text(text(catalog.hook.note));
    doc.moveDown();
  }

  const chips = catalog.chips || [];
  if (chips.length) {
    doc.fontSize(13).text("Товары и услуги");
    chips.forEach((chip, index) => {
      doc.moveDown(0.2);
      doc.fontSize(12).text(`${index + 1}. ${text(chip.title)}`);
      doc.text(chip.price > 0 ? `Цена: ${money(chip.price)}` : "Цена: по запросу");
      if (chip.note) doc.text(text(chip.note));
    });
    doc.moveDown();
  }

  if (catalog.seek) {
    doc.fontSize(13).text("Кого ищем");
    doc.fontSize(12).text(text(catalog.seek));
    doc.moveDown();
  }

  doc.fontSize(9).fillColor("#666666").text(
    "Документ платформы. Картинки позиций в каталоге пока не хранятся — только названия, цены и заметки.",
  );
  doc.moveDown(0.3);
  doc.text(`Сформировано ${when(new Date().toISOString())}`);
  return doc;
}

export function asciiFilename(base) {
  const cleaned = String(base || "document")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${cleaned || "document"}.pdf`;
}

export function utf8Filename(name) {
  const cleaned = String(name || "document.pdf").replace(/[\r\n"]+/g, "").slice(0, 120);
  return cleaned.endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}
