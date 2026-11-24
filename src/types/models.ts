export type Customer = {
  id: string; name: string; phone: string; address: string; plan: string; monthlyFee: number;
  status: 'Active' | 'Inactive' | 'Suspended' | 'Unknown'; joinedAt: string; dueDate: string;
  notes?: string; assignedTo?: string; assignedToName?: string;
};

export type Payment = {
  id: string; customerId: string; customerName: string; amount: number; method: string;
  paidAt: string; month: string; recordedBy?: string; recordedByName?: string;
};
