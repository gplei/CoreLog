import type { Request, Response } from 'express';
import { getTags } from '../repositories/journalRepository';

export async function listTags(request: Request, response: Response) {
  const tags = await getTags(request.query.search?.toString());
  response.json({ tags });
}
