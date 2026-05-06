import type { Lead } from './types';

export const mockLeads: Lead[] = [
  {
    id: 'lead-001',
    name: 'Penzion U Vinohradu',
    accommodationType: 'Penzion',
    city: 'Mikulov',
    websiteOrOtaUrl: 'https://example.com/penzion-u-vinohradu',
    email: 'info@uvinohradu.example',
    status: 'Audit pripraven',
    notes: 'Rodinny penzion, silna sezonnost, vhodny pro rychly audit nabidky na OTA.',
    publicSignals: [
      'Fotografie pokoju jsou nekonzistentni mezi webem a OTA.',
      'Na hlavni strance chybi jasny duvod, proc rezervovat primo.',
      'Recenze casto zminuji snidane, ale web je neukazuje viditelne.',
    ],
    quickWins: [
      'Pridat blok s benefity prime rezervace.',
      'Sjednotit prvnich pet fotografii napric kanaly.',
      'Vytahnout snidane do prvni obrazovky webu.',
    ],
    generatedOutreach:
      'Dobry den, vsiml jsem si nekolika rychlych prilezitosti, jak zlepsit prvni dojem hosta u vaseho penzionu. Rad vam poslu kratky mini-audit bez zavazku.',
    lastContactDate: '',
    nextFollowUpDate: '2026-05-13',
  },
  {
    id: 'lead-002',
    name: 'Apartmany Pod Hradem',
    accommodationType: 'Apartman',
    city: 'Cesky Krumlov',
    websiteOrOtaUrl: 'https://example.com/apartmany-pod-hradem',
    email: 'rezervace@podhradem.example',
    status: 'Novy',
    notes: 'Dobre hodnoceni, slabsi prezentace dlouhodobych pobytu.',
    publicSignals: [
      'OTA profil ma vysoke hodnoceni lokality.',
      'Web nema jasne CTA pro dotaz na dostupnost.',
    ],
    quickWins: [
      'Zvyraznit lokalitu a parkovani v uvodu.',
      'Pridat jednoduche CTA pro prime poptavky.',
    ],
    generatedOutreach: '',
    lastContactDate: '',
    nextFollowUpDate: '',
  },
];