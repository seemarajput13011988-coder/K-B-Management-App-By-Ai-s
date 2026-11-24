import type { ReactNode } from 'react';

export function ProfileItem({ icon, label, value }: { icon: ReactNode; label: ReactNode; value?: ReactNode }) {
  return <div className="profile-item"><span>{icon}</span><div><small>{label}</small><b>{value || '—'}</b></div></div>;
}
