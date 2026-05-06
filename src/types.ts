export type AccommodationType = 'Hotel' | 'Penzion' | 'Apartman' | 'Glamping' | 'Jine';

export type LeadStatus =
  | 'Novy'
  | 'Audit pripraven'
  | 'Osloveni pripravene'
  | 'Kontaktovan'
  | 'Follow-up'
  | 'Nabidka'
  | 'Uzavreno';

export interface Lead {
  id: string;
  name: string;
  accommodationType: AccommodationType;
  city: string;
  websiteOrOtaUrl: string;
  email: string;
  status: LeadStatus;
  notes: string;
  publicSignals: string[];
  quickWins: string[];
  generatedOutreach: string;
  lastContactDate: string;
  nextFollowUpDate: string;
}

export const leadStatuses: LeadStatus[] = [
  'Novy',
  'Audit pripraven',
  'Osloveni pripravene',
  'Kontaktovan',
  'Follow-up',
  'Nabidka',
  'Uzavreno',
];

export const accommodationTypes: AccommodationType[] = [
  'Hotel',
  'Penzion',
  'Apartman',
  'Glamping',
  'Jine',
];