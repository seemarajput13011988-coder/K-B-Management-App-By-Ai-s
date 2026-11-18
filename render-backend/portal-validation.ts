export type PortalConnectionRequestInput = {
  name?: unknown;
  phone?: unknown;
  state?: unknown;
  city?: unknown;
  pincode?: unknown;
  address?: unknown;
  planId?: unknown;
};

export function isValidPortalConnectionRequest(input: PortalConnectionRequestInput): boolean {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const state = typeof input.state === 'string' ? input.state.trim() : '';
  const city = typeof input.city === 'string' ? input.city.trim() : '';
  const pincode = typeof input.pincode === 'string' ? input.pincode.trim() : '';
  const address = typeof input.address === 'string' ? input.address.trim() : '';
  const planId = typeof input.planId === 'string' ? input.planId.trim() : '';
  return !!name && /^[0-9]{10}$/.test(phone) && !!state && !!city &&
    /^[0-9]{6}$/.test(pincode) && !!address && !!planId;
}


export type PortalPlanChangeInput = {
  phone?: unknown;
  planId?: unknown;
};

export function isValidPortalPlanChangeRequest(input: PortalPlanChangeInput): boolean {
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const planId = typeof input.planId === 'string' ? input.planId.trim() : '';
  return /^[0-9]{10}$/.test(phone) && !!planId && planId.length <= 128;
}


export type PortalComplaintInput = {
  phone?: unknown;
  subject?: unknown;
  details?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  dataBase64?: unknown;
};

export function isValidPortalComplaintInput(input: PortalComplaintInput): boolean {
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const details = typeof input.details === 'string' ? input.details.trim() : '';
  const fileName = typeof input.fileName === 'string' ? input.fileName.trim() : '';
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : '';
  const data = typeof input.dataBase64 === 'string' ? input.dataBase64.trim() : '';
  return /^[0-9]{10}$/.test(phone) && !!subject && subject.length <= 150 &&
    !!details && details.length <= 1500 && !!fileName && fileName.length <= 120 &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) &&
    data.length >= 100 && data.length <= 2800000 && data.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(data);
}

export function isValidPortalImageSignature(data: Uint8Array, mimeType: string): boolean {
  const type = mimeType.trim().toLowerCase();
  if (type === 'image/jpeg') {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (type === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return data.length >= signature.length && signature.every((value, index) => data[index] === value);
  }
  if (type === 'image/webp') {
    return data.length >= 12 &&
      data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
      data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50;
  }
  return false;
}
