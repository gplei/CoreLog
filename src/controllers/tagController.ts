import type { Request, Response } from 'express';
import { getTags } from '../repositories/journalRepository';

export async function listTags(request: Request, response: Response) {
  const requestedLimit = Number(request.query.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20;
  const tags = await getTags(request.query.search?.toString(), limit);
  response.json({ tags });
}
