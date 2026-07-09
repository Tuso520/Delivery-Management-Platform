import JSZip = require('jszip');
import { XMLParser } from 'fast-xml-parser';

export interface XmindOutlineNode {
  title: string;
  children: XmindOutlineNode[];
}

export interface XmindOutlineSheet {
  title: string;
  root: XmindOutlineNode;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

export async function buildXmindOutline(
  buffer: Buffer,
): Promise<XmindOutlineSheet[]> {
  const zip = await JSZip.loadAsync(buffer);
  const contentJson = await readZipText(zip, 'content.json');
  if (contentJson) {
    const fromJson = parseXmindJson(contentJson);
    if (fromJson.length) return fromJson;
  }

  const contentXml = await readZipText(zip, 'content.xml');
  if (contentXml) {
    const fromXml = parseXmindXml(contentXml);
    if (fromXml.length) return fromXml;
  }

  return [];
}

async function readZipText(
  zip: JSZip,
  path: string,
): Promise<string | undefined> {
  const file = zip.file(path);
  return file ? file.async('text') : undefined;
}

function parseXmindJson(source: string): XmindOutlineSheet[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return [];
  }

  const sheets = Array.isArray(parsed) ? parsed : [parsed];
  return sheets
    .map((sheet, index) => {
      const sheetRecord = asRecord(sheet);
      const rootTopic = asRecord(sheetRecord?.rootTopic);
      if (!rootTopic) return undefined;
      return {
        title: readText(sheetRecord?.title) || `Sheet ${index + 1}`,
        root: parseJsonTopic(rootTopic),
      };
    })
    .filter((sheet): sheet is XmindOutlineSheet => Boolean(sheet));
}

function parseJsonTopic(topic: Record<string, unknown>): XmindOutlineNode {
  const childrenSource = asRecord(topic.children);
  const attached = childrenSource ? asArray(childrenSource.attached) : [];
  return {
    title: readText(topic.title) || 'Untitled topic',
    children: attached
      .map((child) => asRecord(child))
      .filter((child): child is Record<string, unknown> => Boolean(child))
      .map(parseJsonTopic),
  };
}

function parseXmindXml(source: string): XmindOutlineSheet[] {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(source) as unknown;
  } catch {
    return [];
  }

  const content = asRecord(getPath(parsed, ['xmap-content'])) ?? asRecord(parsed);
  const sheets = asArray(content?.sheet);
  return sheets
    .map((sheet, index) => {
      const sheetRecord = asRecord(sheet);
      const topic = asRecord(sheetRecord?.topic);
      if (!topic) return undefined;
      return {
        title: readText(sheetRecord?.title) || `Sheet ${index + 1}`,
        root: parseXmlTopic(topic),
      };
    })
    .filter((sheet): sheet is XmindOutlineSheet => Boolean(sheet));
}

function parseXmlTopic(topic: Record<string, unknown>): XmindOutlineNode {
  const children = asRecord(topic.children);
  const topics = asArray(asRecord(children?.topics)?.topic);
  return {
    title: readText(topic.title) || readText(topic['@_title']) || 'Untitled topic',
    children: topics
      .map((child) => asRecord(child))
      .filter((child): child is Record<string, unknown> => Boolean(child))
      .map(parseXmlTopic),
  };
}

function getPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => asRecord(current)?.[key], value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function readText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  const record = asRecord(value);
  if (record) {
    return readText(record['#text'] ?? record._text ?? record.title);
  }
  return '';
}
