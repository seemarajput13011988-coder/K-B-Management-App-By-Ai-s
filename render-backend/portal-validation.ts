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
    data.length >= 100 && data.length <= 2800000;
}
