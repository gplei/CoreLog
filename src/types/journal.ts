export type JournalTag = {
  id: number;
  name: string;
};

export type JournalEntry = {
  id: number;
  entry_date: string;
  raw_text: string;
  created_at: string;
  pin: boolean;
  cover_photo_path: string | null;
  cover_thumbnail_path: string | null;
  tags?: string[];
};

export type JournalPhoto = {
  id: number;
  entry_id: number;
  file_path: string;
  thumbnail_path: string;
  sort_order: number;
  is_cover: boolean;
};

export type JournalEntryDetail = Omit<JournalEntry, 'tags'> & {
  photos: JournalPhoto[];
  tags: JournalTag[];
};
