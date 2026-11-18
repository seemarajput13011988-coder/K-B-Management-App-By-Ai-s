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
