export const REPORT_COLOR_PALETTE = [
  '#f3a089',
  '#efbf74',
  '#f2d56f',
  '#e8df7e',
  '#d2da82',
  '#b2cf8d',
  '#7cc7be',
  '#75c6d0',
  '#84b7d9',
  '#99a0d2',
  '#b387c6',
  '#de7ea8',
];

const HEX_COLOR_REGEX = /^#?[0-9a-fA-F]{6}$/;

export const normalizeReportColor = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.startsWith('#')
    ? trimmed.toLowerCase()
    : `#${trimmed.toLowerCase()}`;
};

export const resolveDeviceReportColor = (device, groups) => {
  const deviceColor = normalizeReportColor(device?.attributes?.['web.reportColor']);
  if (deviceColor) {
    return deviceColor;
  }

  const groupId = device?.groupId;
  const groupColor = normalizeReportColor(groups?.[groupId]?.attributes?.['web.reportColor']);
  if (groupColor) {
    return groupColor;
  }

  return null;
};
