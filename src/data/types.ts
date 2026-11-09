export type Sex = 'cock' | 'hen' | 'unknown';
export type BirdStatus = 'active' | 'sold' | 'lost' | 'dead';

export interface Bird {
  id: string;
  ring_country: string | null;
  ring_number: number | null;
  ring_code: string | null;
  ring_year: number | null;
  name: string | null;
  sex: Sex;
  colour: string | null;
  hatch_date: string | null;
  sire_id: string | null;
  dam_id: string | null;
  clutch_id: string | null;
  status: BirdStatus;
  notes: string | null;
  created_at?: string;
}

export interface Box {
  id: string;
  name: string;
  section: string;
  sort_order: number;
  active: boolean;
  notes: string | null;
}

export interface Season {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
}

export interface Pairing {
  id: string;
  season_id: string;
  pairing_no: number;
  box_id: string | null;
  block: string | null;
  cock_id: string;
  hen_id: string;
  sort_order: number;
  notes: string | null;
}

export interface Clutch {
  id: string;
  pairing_id: string;
  round_no: number;
  laid_date: string | null;
  notes: string | null;
}

export interface RingSequenceRow {
  id: string;
  country: string;
  code: string;
  year: number;
  start_no: number;
  end_no: number;
  notes: string | null;
}

export interface Comment {
  id: string;
  bird_id: string | null;
  pairing_id: string | null;
  body: string;
  created_at: string;
}

export interface Tables {
  birds: Bird;
  boxes: Box;
  seasons: Season;
  pairings: Pairing;
  clutches: Clutch;
  ring_sequences: RingSequenceRow;
  comments: Comment;
}
export type TableName = keyof Tables;

export type AllData = { [K in TableName]: Tables[K][] };
