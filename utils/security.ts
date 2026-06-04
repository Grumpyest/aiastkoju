export const MAX_SHORT_TEXT_LENGTH = 120;
export const MAX_LONG_TEXT_LENGTH = 1200;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export const cleanText = (value: unknown, maxLength = MAX_SHORT_TEXT_LENGTH) =>
  String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

export const cleanEmail = (value: unknown) =>
  cleanText(value, 254).toLowerCase();

export const cleanPhone = (value: unknown) =>
  cleanText(value, 32).replace(/[^\d+()\-\s]/g, '');

export const cleanUrlPathPart = (value: unknown) =>
  cleanText(value, 160).replace(/[^a-zA-Z0-9._-]/g, '_');

export const assertSafeImageFile = (file: File, maxBytes = 5 * 1024 * 1024) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Lubatud on ainult pildifailid.');
  }

  if (file.size > maxBytes) {
    throw new Error('Pildifail on liiga suur. Maksimaalne suurus on 5 MB.');
  }
};
