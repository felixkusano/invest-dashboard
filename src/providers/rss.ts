/**
 * Offizielle Notenbank-Pressemitteilungen per RSS (ohne Key, frei zugänglich).
 * Es werden nur Titel, Link, Datum und Kurzbeschreibung übernommen.
 */
import { getText } from "@/lib/http";
import type { RawArticle } from "@/domain/news";
import type { NewsProvider } from "./types";
import { snippet } from "./eodhd";

export const OFFICIAL_FEEDS = [
  { publisher: "Europäische Zentralbank", url: "https://www.ecb.europa.eu/rss/press.html", category: "central_bank" },
  { publisher: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", category: "central_bank" },
];

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (item: string, t: string) => { const m = item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? decode(m[1]) : null; };

export function parseRss(xml: string, publisher: string, category: string): RawArticle[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.map((it) => {
    const link = tag(it, "link") ?? tag(it, "guid") ?? "";
    const date = tag(it, "pubDate") ?? tag(it, "dc:date");
    return {
      url: link, headline: tag(it, "title") ?? "", publisher, publishedAt: date ? new Date(date) : new Date(NaN),
      summary: snippet(tag(it, "description")), tickers: [], provider: "rss", categoryHint: category,
    };
  }).filter((a) => a.url.startsWith("http") && a.headline && !Number.isNaN(a.publishedAt.getTime()));
}

export class OfficialRssProvider implements NewsProvider {
  readonly name = "rss";
  constructor(private fetchImpl?: typeof fetch) {}
  async companyNews(): Promise<RawArticle[]> { return []; }
  async marketNews(): Promise<RawArticle[]> {
    const out: RawArticle[] = [];
    for (const f of OFFICIAL_FEEDS) {
      const xml = await getText(f.url, { provider: this.name, fetchImpl: this.fetchImpl });
      out.push(...parseRss(xml, f.publisher, f.category).slice(0, 15));
    }
    return out;
  }
}
