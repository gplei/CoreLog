import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { db } from '../db/pool';
import { HttpError } from '../utils/http';

type QuickLink = {
  id?: number;
  name: string;
  url?: string;
  tip?: string;
  imgUrl?: string;
  img_url?: string;
  groupName?: string;
};

const defaultGroupOrder = [
  'Google',
  'Finance',
  'Shopping',
  'Social',
  'Stream',
  'Tools',
  'WiFi device',
  'Health/gov',
  'Travel',
  'Media',
  'Other',
];

function configuredGroupOrder() {
  const row = db.prepare('select setting_value from app_setting where setting_key = ?').get('qlinks.groups') as { setting_value?: string } | undefined;
  try {
    const parsed = JSON.parse(row?.setting_value ?? '{}');
    const groups = parsed?.group && typeof parsed.group === 'object' ? Object.keys(parsed.group) : [];
    const names = groups
      .map((group: unknown) => typeof group === 'string' ? group : (group as { name?: unknown })?.name)
      .filter((name: unknown): name is string => typeof name === 'string' && Boolean(name.trim()))
      .map((name: string) => name.trim());
    return names.length ? names : defaultGroupOrder;
  } catch {
    return defaultGroupOrder;
  }
}

function readString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
}

export function listQuickLinks(_request: Request, response: Response) {
  const links = db.prepare(`
    select id, name, url, tip, img_url as imgUrl, note, group_name as groupName
    from qlink
    order by sort_order, id
  `).all() as Array<QuickLink & { id: number }>;
  const result: QuickLink[] = [];
  const groupOrder = configuredGroupOrder();
  const groups = [...new Set(links.map((link) => link.groupName).filter((group): group is string => Boolean(group)))].sort((left, right) => {
    const leftIndex = groupOrder.indexOf(left);
    const rightIndex = groupOrder.indexOf(right);
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return left.localeCompare(right);
  });
  for (const group of groups) {
    result.push({ name: '--', groupName: group });
    result.push(...links.filter((link) => link.groupName === group));
  }
  result.push(...links.filter((link) => !link.groupName));
  response.json(result);
}

function nextLinkOrder(groupName: string) {
  const row = db.prepare('select coalesce(max(sort_order), -1) + 1 as sort_order from qlink where coalesce(group_name, ?) = ?').get('', groupName);
  return (row as { sort_order: number }).sort_order;
}

function faviconExtension(contentType: string, sourceUrl: string) {
  const normalizedType = contentType.split(';')[0].trim().toLowerCase();
  const byType: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
  };
  if (byType[normalizedType]) return byType[normalizedType];
  const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(extension) ? extension : '.ico';
}

async function findFaviconUrl(url: URL) {
  try {
    const pageResponse = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const html = await pageResponse.text();
    const match = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/i)
      || html.match(/<link[^>]+href=["'][^"']+["'][^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/i);
    const href = match?.[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (href) return new URL(href, url);
  } catch {
    // Fall back to the conventional favicon location.
  }
  return new URL('/favicon.ico', url.origin);
}

async function saveFavicon(url: string, name: string) {
  const siteUrl = new URL(url);
  if (!['http:', 'https:'].includes(siteUrl.protocol)) {
    throw new HttpError(400, 'URL must use http or https');
  }

  const faviconUrls = [
    await findFaviconUrl(siteUrl),
    new URL('/favicon.ico', siteUrl.origin),
    new URL(`https://icons.duckduckgo.com/ip3/${siteUrl.hostname}.ico`),
    new URL(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(siteUrl.hostname)}&sz=64`),
  ];
  let faviconResponse: globalThis.Response | null = null;
  let body: Buffer | null = null;
  let faviconUrl: URL | null = null;
  for (const candidate of faviconUrls) {
    try {
      const response = await fetch(candidate, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const candidateBody = Buffer.from(await response.arrayBuffer());
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const bodyStart = candidateBody.subarray(0, 256).toString('utf8').trimStart().toLowerCase();
      if (candidateBody.length > 0 && candidateBody.length <= 2 * 1024 * 1024
        && contentType !== 'text/html'
        && !bodyStart.startsWith('<!doctype')
        && !bodyStart.startsWith('<html')) {
        faviconResponse = response;
        body = candidateBody;
        faviconUrl = candidate;
        break;
      }
    } catch {
      // Try the next favicon location.
    }
  }

  if (!faviconResponse || !body || !faviconUrl) throw new HttpError(400, 'Unable to download site favicon');

  const fileName = `qlink-${randomUUID()}${faviconExtension(faviconResponse.headers.get('content-type') || '', faviconUrl.toString())}`;
  await mkdir(env.faviconDirectory, { recursive: true });
  await writeFile(path.join(env.faviconDirectory, fileName), body);
  return fileName;
}

async function hasValidLocalIcon(imgUrl: string | null | undefined) {
  if (!imgUrl || /^https?:\/\//i.test(imgUrl)) return false;
  try {
    const iconBody = await readFile(path.join(env.faviconDirectory, path.basename(imgUrl)));
    const iconStart = iconBody.subarray(0, 256).toString('utf8').trimStart().toLowerCase();
    return iconBody.length > 0
      && !iconStart.startsWith('<!doctype')
      && !iconStart.startsWith('<html');
  } catch {
    return false;
  }
}

export async function seedQuickLinkIcons(_request: Request, response: Response) {
  const links = db.prepare('select id, name, url, img_url as imgUrl from qlink order by id').all() as Array<QuickLink & { id: number }>;
  let seeded = 0;
  let skipped = 0;
  const failed: Array<{ id: number; name: string; error: string }> = [];

  for (const link of links) {
    if (!link.url || await hasValidLocalIcon(link.imgUrl)) {
      skipped += 1;
      continue;
    }
    try {
      const imgUrl = await saveFavicon(link.url, link.name);
      db.prepare('update qlink set img_url = ?, updated_at = current_timestamp where id = ?').run(imgUrl, link.id);
      seeded += 1;
    } catch (error) {
      failed.push({
        id: link.id,
        name: link.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  response.json({ seeded, skipped, failed });
}

export async function createQuickLink(request: Request, response: Response) {
  const name = readString(request.body.name, 'name');
  const url = readString(request.body.url, 'url');
  const tip = typeof request.body.tip === 'string' ? request.body.tip.trim() : '';
  const groupName = typeof request.body.groupName === 'string' ? request.body.groupName.trim() : '';
  const normalizedUrl = new URL(url).href.replace(/\/$/, '').toLowerCase();
  const duplicate = db.prepare(`
    select id from qlink
    where lower(trim(name)) = lower(?)
       or lower(rtrim(trim(coalesce(url, '')), '/')) = ?
    limit 1
  `).get(name, normalizedUrl);
  if (duplicate) {
    throw new HttpError(409, 'A qLink with the same name or URL already exists');
  }
  const imgUrl = await saveFavicon(url, name);
  const result = db.prepare(`
    insert into qlink (group_name, name, url, tip, img_url, sort_order)
    values (?, ?, ?, ?, ?, ?)
  `).run(groupName || null, name, url, tip || null, imgUrl, nextLinkOrder(groupName));
  const nextLink: QuickLink = { id: Number(result.lastInsertRowid), name, url, imgUrl, groupName: groupName || undefined };
  if (tip) nextLink.tip = tip;
  response.status(201).json({ link: nextLink });
}

export async function updateQuickLink(request: Request, response: Response) {
  const id = Number(request.params.index);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid qLink id');

  const name = readString(request.body.name, 'name');
  const url = readString(request.body.url, 'url');
  const tip = typeof request.body.tip === 'string' ? request.body.tip.trim() : '';
  const requestedGroupName = typeof request.body.groupName === 'string' ? request.body.groupName.trim() : null;
  const current = db.prepare('select *, group_name as groupName from qlink where id = ?').get(id) as QuickLink | undefined;
  if (!current) throw new HttpError(404, 'qLink not found');
  const groupName = requestedGroupName === null ? (current.groupName || '') : requestedGroupName;

  const normalizedUrl = new URL(url).href.replace(/\/$/, '').toLowerCase();
  const duplicate = db.prepare(`
    select id from qlink
    where id <> ? and (
      lower(trim(name)) = lower(?)
      or lower(rtrim(trim(coalesce(url, '')), '/')) = ?
    ) limit 1
  `).get(id, name, normalizedUrl);
  if (duplicate) throw new HttpError(409, 'A qLink with the same name or URL already exists');

  const sameUrl = current.url?.trim().replace(/\/$/, '').toLowerCase() === normalizedUrl;
  const imgUrl = sameUrl ? current.img_url : await saveFavicon(url, name);
  db.prepare(`
    update qlink
    set group_name = ?, name = ?, url = ?, tip = ?, img_url = ?, updated_at = current_timestamp
    where id = ?
  `).run(groupName || null, name, url, tip || null, imgUrl, id);
  const updated: QuickLink = { id, name, url, imgUrl };
  if (tip) updated.tip = tip;
  if (groupName) updated.groupName = groupName;
  response.json({ link: updated });
}

export async function reorderQuickLinks(request: Request, response: Response) {
  const order = request.body?.order;
  if (!Array.isArray(order) || order.length === 0) {
    throw new HttpError(400, 'qLink order is required');
  }

  const ids = order.map((item: { id?: unknown }) => Number(item?.id));
  if (ids.some((id) => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'Invalid qLink order');
  }
  const existing = db.prepare(`select id from qlink where id in (${ids.map(() => '?').join(',')})`).all(...ids) as Array<{ id: number }>;
  if (existing.length !== ids.length) throw new HttpError(400, 'Incomplete qLink order');
  const transaction = db.transaction(() => {
    const update = db.prepare('update qlink set sort_order = ?, updated_at = current_timestamp where id = ?');
    order.forEach((item: { id: number }, sortOrder: number) => update.run(sortOrder, Number(item.id)));
  });
  transaction();
  response.json({ ok: true });
}

export function deleteQuickLink(request: Request, response: Response) {
  const rawId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid qLink id');

  const result = db.prepare('delete from qlink where id = ?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'qLink not found');
  response.json({ ok: true });
}
