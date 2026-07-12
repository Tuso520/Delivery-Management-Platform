import { XMLParser } from 'fast-xml-parser';
import JSZip = require('jszip');

export interface XmindOutlineNode {
  title: string;
  children: XmindOutlineNode[];
}

export interface XmindOutlineSheet {
  title: string;
  root: XmindOutlineNode;
}

const maxArchiveBytes = 25 * 1024 * 1024;
const maxContentBytes = 10 * 1024 * 1024;
const maxNodes = 5_000;
const maxDepth = 30;
const maxTitleLength = 500;

export class XmindParseError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function parseXmindOutline(source: Buffer): Promise<XmindOutlineSheet[]> {
  if (source.length === 0 || source.length > maxArchiveBytes) {
    throw new XmindParseError(
      source.length > maxArchiveBytes ? 'XMIND_INPUT_TOO_LARGE' : 'XMIND_INVALID_ARCHIVE',
    );
  }

  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(source, { checkCRC32: true, createFolders: false });
  } catch {
    throw new XmindParseError('XMIND_INVALID_ARCHIVE');
  }

  const jsonEntry = archive.file('content.json');
  const xmlEntry = archive.file('content.xml');
  const entry = jsonEntry ?? xmlEntry;
  if (!entry) throw new XmindParseError('XMIND_CONTENT_MISSING');
  assertEntrySize(entry);

  let content: string;
  try {
    content = await entry.async('string');
  } catch {
    throw new XmindParseError('XMIND_CONTENT_INVALID');
  }
  if (Buffer.byteLength(content, 'utf8') > maxContentBytes) {
    throw new XmindParseError('XMIND_CONTENT_TOO_LARGE');
  }

  return jsonEntry ? parseModernContent(content) : parseLegacyContent(content);
}

function assertEntrySize(entry: JSZip.JSZipObject): void {
  const uncompressedSize = (entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: unknown } })
    ._data?.uncompressedSize;
  if (typeof uncompressedSize === 'number' && uncompressedSize > maxContentBytes) {
    throw new XmindParseError('XMIND_CONTENT_TOO_LARGE');
  }
}

function parseModernContent(content: string): XmindOutlineSheet[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new XmindParseError('XMIND_CONTENT_INVALID');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new XmindParseError('XMIND_STRUCTURE_INVALID');
  }

  const counter = { value: 0 };
  const sheets = parsed.map((rawSheet, index) => {
    const sheet = record(rawSheet);
    const rootTopic = record(sheet?.rootTopic);
    if (!sheet || !rootTopic) throw new XmindParseError('XMIND_STRUCTURE_INVALID');
    return {
      title: safeTitle(sheet.title, `Sheet ${index + 1}`),
      root: modernTopic(rootTopic, counter, 0),
    };
  });
  return sheets;
}

function modernTopic(
  topic: Record<string, unknown>,
  counter: { value: number },
  depth: number,
): XmindOutlineNode {
  countNode(counter, depth);
  const children = record(topic.children);
  const childTopics = children
    ? [...array(children.attached), ...array(children.detached), ...array(children.summary)]
    : [];
  return {
    title: safeTitle(topic.title, 'Untitled topic'),
    children: childTopics.map((child) => {
      const childTopic = record(child);
      if (!childTopic) throw new XmindParseError('XMIND_STRUCTURE_INVALID');
      return modernTopic(childTopic, counter, depth + 1);
    }),
  };
}

function parseLegacyContent(content: string): XmindOutlineSheet[] {
  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: false,
      maxNestedTags: maxDepth + 10,
      trimValues: true,
    }).parse(content) as unknown;
  } catch {
    throw new XmindParseError('XMIND_CONTENT_INVALID');
  }

  const root = record(parsed);
  const xmap = record(root?.['xmap-content']) ?? root;
  const rawSheets = array(xmap?.sheet);
  if (!xmap || rawSheets.length === 0) throw new XmindParseError('XMIND_STRUCTURE_INVALID');

  const counter = { value: 0 };
  return rawSheets.map((rawSheet, index) => {
    const sheet = record(rawSheet);
    const topic = record(sheet?.topic);
    if (!sheet || !topic) throw new XmindParseError('XMIND_STRUCTURE_INVALID');
    return {
      title: safeTitle(sheet.title ?? sheet['@_title'], `Sheet ${index + 1}`),
      root: legacyTopic(topic, counter, 0),
    };
  });
}

function legacyTopic(
  topic: Record<string, unknown>,
  counter: { value: number },
  depth: number,
): XmindOutlineNode {
  countNode(counter, depth);
  const childrenContainer = record(topic.children);
  const topicGroups = array(childrenContainer?.topics);
  const childTopics = topicGroups.flatMap((group) => array(record(group)?.topic));
  return {
    title: safeTitle(topic.title, 'Untitled topic'),
    children: childTopics.map((child) => {
      const childTopic = record(child);
      if (!childTopic) throw new XmindParseError('XMIND_STRUCTURE_INVALID');
      return legacyTopic(childTopic, counter, depth + 1);
    }),
  };
}

function countNode(counter: { value: number }, depth: number): void {
  if (depth > maxDepth) throw new XmindParseError('XMIND_STRUCTURE_TOO_DEEP');
  counter.value += 1;
  if (counter.value > maxNodes) throw new XmindParseError('XMIND_TOO_MANY_NODES');
}

function safeTitle(value: unknown, fallback: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return (normalized || fallback).slice(0, maxTitleLength);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
