export const GLOBAL_COLLECTIONS = new Set(['users', 'sessions', 'businesses', 'business_memberships', 'staff_registration_requests']);

export function businessCollectionPath(collectionName:string,businessId=''):string[] {
  if (!businessId || GLOBAL_COLLECTIONS.has(collectionName) || businessId === 'legacy-default') {
    return [collectionName];
  }
  return ['businesses',businessId,collectionName];
}
