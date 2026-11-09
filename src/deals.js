export function dailySeed(date = new Date()) {
  const value = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  return value >>> 0;
}

export function encodeOptions(options) {
  return Object.keys(options || {})
    .sort()
    .map((key) => key + ':' + options[key])
    .join('-');
}

export function decodeOptions(code) {
  const options = {};
  if (!code) return options;
  code.split('-').forEach((pair) => {
    const [key, value] = pair.split(':');
    if (!key) return;
    options[key] = /^[0-9]+$/.test(value) ? Number(value) : value;
  });
  return options;
}

export function dealCode(state) {
  return [state.variantId, (state.seed >>> 0).toString(36), encodeOptions(state.options)].join('.');
}

export function decodeDeal(code) {
  const parts = String(code || '').split('.');
  if (!parts[0] || !parts[1]) return null;
  const seed = parseInt(parts[1], 36);
  if (Number.isNaN(seed)) return null;
  return { variantId: parts[0], seed: seed >>> 0, options: decodeOptions(parts[2]) };
}
