// backend/utils/dateUtil.js
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const utc = require('dayjs/plugin/utc');

dayjs.extend(customParseFormat);
dayjs.extend(utc);

const INPUT_FORMATS = [
  'DD-MM-YYYY HH:mm',
  'DD-MM-YYYY HH:mm:ss',
  'DD/MM/YYYY HH:mm',
  'DD/MM/YYYY HH:mm:ss',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DDTHH:mm',
  'YYYY-MM-DDTHH:mm:ss',
  'YYYY-MM-DDTHH:mmZ',
  'YYYY-MM-DDTHH:mm:ssZ',
];

function toSqlDate(value) {
  if (value === null || value === undefined || value === '') return null;

  const str = String(value).trim();
  const hasTz = /(?:Z|[+\-]\d{2}:?\d{2})$/i.test(str);

  let d = null;

  if (value instanceof Date) {
    d = dayjs(value);
  } else if (/^\d+$/.test(str)) {
    d = dayjs(Number(str));
  } else {
    for (const f of INPUT_FORMATS) {
      const p = dayjs(str, f, true);
      if (p.isValid()) { d = p; break; }
    }
    if (!d || !d.isValid()) {
      const p = dayjs(str);
      if (p.isValid()) d = p;
    }
  }

  if (!d || !d.isValid()) {
    throw new Error(`Invalid date: ${value}`);
  }

  if (hasTz) d = d.utc();

  return d.format('YYYY-MM-DD HH:mm:ss');
}

/** Format a SQL DATETIME (or Date) to UI string */
function fromSqlToUi(value) {
  if (!value) return '';
  const d = dayjs(value);
  return d.isValid() ? d.format('DD-MM-YYYY HH:mm') : '';
}

module.exports = { toSqlDate, fromSqlToUi, INPUT_FORMATS };
