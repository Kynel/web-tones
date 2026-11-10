// Subset of the TONE3000 API v1 shapes this app reads.
// Reference: https://www.tone3000.com/api

export interface T3kUser {
  id: number | string;
  username: string;
  /** Null unless the creator is verified; fall back to username. */
  display_name: string | null;
  is_verified: boolean;
  avatar_url: string | null;
  url: string;
}

export interface T3kTone {
  id: number;
  title: string;
  description: string | null;
  /** amp | amp-cab | pedal | outboard | cab | space | experimental */
  gear: string;
  /** nam | ir | aida-x | aa-snapshot | proteus */
  format: string;
  license: string;
  images: string[] | null;
  user: T3kUser;
  url: string;
  models_count: number;
  a1_models_count?: number;
  a2_models_count?: number;
  irs_count?: number;
  downloads_count?: number;
}

export interface T3kModel {
  id: number;
  name: string;
  size: string | null;
  tone_id: number;
  /** Absolute URL; must be fetched with the Bearer token. */
  model_url: string;
  architecture_version: '1' | '2' | 'custom' | null;
}

export interface T3kTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export type T3kList = 'trending' | 'latest' | 'favorited' | 'downloaded';
