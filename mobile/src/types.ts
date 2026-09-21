// ─── Site Audit Data Model ───────────────────────────────────────────────────
// Matches the exact field structure of:
// - Ground Equipment Scope
// - DCDB Information
// - Tower Equipment Scope

export interface SiteInfo {
  siteId: string;
  atcNo: string;
  siteName: string;
  surveyDate: string;
  technicianName: string;
  technicianContacts: string;
  contractorName: string;
  latitude: string;
  longitude: string;
  towerType: 'GBT' | 'RTT' | 'RTP' | '';
  towerHeight: number;
  buildingHeight: number;
  totalHeight: number;
  indoorOutdoor: 'Indoor' | 'Outdoor' | '';
  noOfTenants: number;
  otherTenants: string;
  gridPower: boolean;
  dgPower: boolean;
  solarPower: boolean;
  gridDistanceTo3Phase: number;
  guardAtSite: boolean;
  trmMediaFiber: boolean;
  overallRemarks: string;
}

export interface GroundEquipment {
  id: string;
  siteId: string;
  // RRU on Ground
  rruTypeOnGround: string;
  rruCountOnGround: number;
  // Cabinets
  cabinetTypes: string;
  cabinetCount: number;
  labellingDone: 'Done' | 'Not Done' | '';
  cabinetComments: string;
  cabinetDimensions: string; // L×W×H
  // Active IDU
  activeIduTypes: string;
  activeIduCount: number;
  // Non-Active IDU
  nonActiveIduTypes: string;
  nonActiveIduCount: number;
  // Slabs
  slabDimensions: string; // L×W in m
  // Redundant
  redundantEquipment: string;
  redundantCount: number;
  // BTS dims (used in app forms)
  btsDimensions: string;
  iduCount: number;
  trmMedia: string;
  // Form fields (tower info stored in ground record)
  gridPower?: boolean;
  dgPower?: boolean;
  solarPower?: boolean;
  trmMediaFiber?: boolean;
  no?: string | number;
  towerType?: string;
  towerHeight?: number;
  buildingHeight?: number;
  totalHeight?: number;
  indoorOutdoor?: string;
  gridDistanceTo3Phase?: number;
  gridDistance3Phase?: number;
  gridDgSolar?: string;
  guardAtSite?: boolean;
  remarks?: string;
  // Meta
  createdAt: string;
  synced: boolean;
}

export interface DCDBRecord {
  id: string;
  siteId: string;
  // DCDB non-priority
  gridDistanceTo3Phase: number;
  dcdbSupplyCableSize: number;
  dcdbSupplyCableToDCDU: number;
  dcdbSupplyLoadMeasurement: number;
  dcdbTimeMeasured: string;
  dcdbBreaker1: number;
  dcdbBreaker2: number;
  dcdbBreaker3: number;
  dcdbBreaker4: number;
  dcdbBreaker5: number;
  // DCDB priority
  prioritySupplyCableSize: number;
  prioritySupplyCableToDCDU: number;
  priorityLoadMeasurement: number;
  priorityBreaker1: number;
  // DCDU
  dcdiBreaker1: string;
  dcdiBreaker2: string;
  dcdiBreaker3: string;
  dcdiBreaker4: string;
  dcdiBreaker5: string;
  totalDCDUCount: number;
  // RRU cables
  rruCount: number;
  rruPowerCableCount: number;
  rruPowerCableMissing: number;
  rruPowerCableLengthPerRun: number;
  rruPowerCableTotalMissing: number;
  rruEarthingCableCount: number;
  rruEarthingCableMissing: number;
  rruEarthingCableLength: number;
  // AAU cables
  aauCount: number;
  aauPowerCableCount: number;
  aauPowerCableMissing: number;
  aauPowerCableLength: number;
  aauPowerCableTotalMissing: number;
  aauEarthingCableCount: number;
  aauEarthingCableMissing: number;
  aauEarthingCableLength: number;
  // BTS earthing
  btsEarthingCableCount: number;
  btsEarthingCableMissing: number;
  btsEarthingLengthPerRun: number;
  btsEarthingTotalMissing: number;
  earthingConnection: string;
  // Extra fields used by app
  no?: string | number;
  dcdbPrioritySupplyCableSize?: number;
  dcdbLoadAmps?: number;
  rruPowerCableLength?: number;
  btsEarthingCableLength?: number;
  remarks?: string;
  // Meta
  createdAt: string;
  synced: boolean;
}

export interface TowerEquipment {
  id: string;
  siteId: string;
  no: number;
  airtelSiteId: string;
  siteName: string;
  equipmentType: 'RF antenna' | 'MW Antenna' | 'MW ODU' | 'RRU' | 'BBU' | 'DCDB' | 'Other';
  rfEquipmentType?: string;
  antennaManufacturer: string;
  antennaModel: string;
  tenantOwner: string;
  sector: 'A' | 'B' | 'C' | 'Alpha' | 'Beta' | 'Gamma' | '';
  azimuth: number;
  heightToCentre: number;
  antennaCount: number;
  antennaPerSector?: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  antennaLengthMm?: number;
  antennaWidthMm?: number;
  antennaHeightMm?: number;
  activeInactive: 'Active' | 'Inactive' | 'Standby' | '';
  activeStatus?: string;
  labelling: 'Done' | 'Not Done' | '';
  labellingDone?: 'Done' | 'Not Done' | '';
  equipmentLabelling?: string;
  remarks: string;
  // Meta
  createdAt: string;
  synced: boolean;
}

export interface PhotoRecord {
  id: string;
  filename: string;
  path: string; // blob URL or file path
  category: 'ground' | 'dcdb' | 'tower' | 'general';
  equipmentId?: string;
  siteId?: string;
  uploaded: boolean;
}

export interface AppState {
  // Auth
  token: string | null;
  currentUser: AuthUser | null;
  // Site
  selectedSite: SiteAssignment | null;
  assignedSites: SiteAssignment[];
  // Data
  siteInfo: SiteInfo | null;
  groundEquipment: GroundEquipment[];
  dcdbRecords: DCDBRecord[];
  towerEquipment: TowerEquipment[];
  photos: PhotoRecord[];
  currentTab: 'login' | 'sites' | 'site' | 'ground' | 'dcdb' | 'tower' | 'photos' | 'sync';
  isOnline: boolean;
}

// ─── Auth Types ────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'engineer';
}

export interface SiteAssignment {
  id: string;
  siteId: string;
  siteName: string;
  atcNo: string;
  latitude: string;
  longitude: string;
  status: 'active' | 'inactive';
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export const EQUIPMENT_TYPES = [
  'RF antenna', 'MW Antenna', 'MW ODU', 'RRU', 'BBU', 'DCDB', 'Other'
] as const;

export const SECTOR_OPTIONS = ['A', 'B', 'C', 'Alpha', 'Beta', 'Gamma'] as const;
export const TOWER_TYPES = ['GBT', 'RTT', 'RTP'] as const;
export const LABELLING_OPTIONS = ['Done', 'Not Done'] as const;
export const ACTIVE_OPTIONS = ['Active', 'Inactive', 'Standby'] as const;
