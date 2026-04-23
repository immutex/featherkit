import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { basename, extname, isAbsolute, normalize, relative, resolve } from 'node:path';

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function getCacheControl(filePath: string): string {
  if (extname(filePath) === '.html') {
    return 'no-cache';
  }

  return /-[A-Za-z0-9_-]{8,}\./.test(basename(filePath)) ? 'max-age=31536000, immutable' : 'no-cache';
}

export function resolveStaticFilePath(dashboardDistDir: string, requestPath: string): string | null {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const requestedPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = resolve(dashboardDistDir, normalize(requestedPath));
  const relativePath = relative(dashboardDistDir, filePath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

export async function serveStaticFile(res: ServerResponse, filePath: string): Promise<boolean> {
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Cache-Control': getCacheControl(filePath),
    });
    res.end(body);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return false;
    }

    throw error;
  }
}
