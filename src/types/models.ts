export type Customer = {
  id: string; name: string; phone: string; address: string; plan: string; monthlyFee: number;
  status: 'Active' | 'Inactive' | 'Suspended' | 'Unknown'; joinedAt: string; dueDate: string;
  notes?: string; assignedTo?: string; assignedToName?: string;
};

export type Payment = {
  id: string; customerId: string; customerName: string; amount: number; method: string;
  paidAt: string; month: string; recordedBy?: string; recordedByName?: string;
};

export type Staff = { id: string; userId: string; displayName: string; role: 'staff'; active: boolean; phone?: string; createdAt?: string };

export type AdminAccount = { id: string; userId: string; displayName: string; role: 'admin'; active: boolean; canManageAdmins?: boolean; isSuperAdmin?: boolean };

export type AttendanceRecord = { id: string; userId: string; displayName: string; workDate: string; checkInAt: string; checkOutAt?: string; autoCheckoutAt?: string; scheduledEndAt?: string; shiftEndTime?: string; gpsRestartRequired?: boolean; gpsCancelled?: boolean; dayType?: 'Full day' | 'Half day' | 'Absent'; status?: string; correctionReason?: string; correctedAt?: string; correctedByName?: string; startedByAdmin?: string; endedByAdminName?: string; endedByName?: string; attendanceSource?: string; absenceReason?: string };

export type Task = { id: string; title: string; details: string; assignedTo: string; assignedToName: string; priority: 'Low' | 'Normal' | 'High'; dueDate: string; status: 'Pending' | 'In progress' | 'Completed'; createdAt: string; createdByName: string; updatedAt?: string; completedAt?: string; attachments?: Array<{mediaId:string;fileName:string;mimeType:string;size:number}> };

export type Complaint = {
  id: string;
  complaintFor: 'Customer' | 'Staff';
  customerId?: string;
  customerName?: string;
  staffId?: string;
  staffName?: string;
  subject: string;
  details: string;
  priority: string;
  status: 'Pending' | 'Assigned' | 'In Progress' | 'Solved' | 'Not Solved' | string;
  createdAt: string;
  createdByName?: string;
  assignedTo?: string;
  assignedToName?: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  resolvedByName?: string;
  resolvedAt?: string;
  resolutionDetails?: string;
  attachments?: Array<{mediaId:string;fileName:string;mimeType:string;size:number}>;
};

export type Plan = {
  id: string;
  name: string;
  provider: string;
  speed: string;
  data: string;
  price: number;
  note: string;
  details?: string;
  connectionType: string;
  featured: boolean;
  active: boolean;
};
