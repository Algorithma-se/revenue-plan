export type AccountSegment = 'platform' | 'services' | 'leadership'
export type AccountType    = 'revenue' | 'cost'

export interface AccountDef {
  code:    string
  name:    string
  segment: AccountSegment
  type:    AccountType
}

export const ACCOUNT_CODES: AccountDef[] = [
  // Revenue
  { code: '3100', name: 'AOS Setup fees',                     segment: 'platform',   type: 'revenue' },
  { code: '3200', name: 'AOS Subscriptions Core/Runtime',     segment: 'platform',   type: 'revenue' },
  { code: '3300', name: 'AOS Control license subscriptions',  segment: 'platform',   type: 'revenue' },
  { code: '3400', name: 'FDE project',                        segment: 'services',   type: 'revenue' },
  { code: '3500', name: 'FDE recurring services',             segment: 'services',   type: 'revenue' },
  // Costs
  { code: '4100', name: 'Hosting och Cloud Ops',              segment: 'platform',   type: 'cost' },
  { code: '4200', name: 'Tredjepartslicenser och API:er',     segment: 'platform',   type: 'cost' },
  { code: '4300', name: 'Direkta plattformskostnader',        segment: 'platform',   type: 'cost' },
  { code: '4400', name: 'Underkonsulter FDE',                 segment: 'services',   type: 'cost' },
  { code: '4500', name: 'Direkta projektkostnader',           segment: 'services',   type: 'cost' },
  { code: 'corp', name: 'Leadership & overhead',              segment: 'leadership', type: 'cost' },
]

export function codesFor(segment: AccountSegment, type: AccountType): AccountDef[] {
  return ACCOUNT_CODES.filter(c => c.segment === segment && c.type === type)
}
