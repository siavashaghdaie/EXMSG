/**
 * Web Search Service for Linda AI
 * Uses SerpAPI (Google Search) to fetch real-time web results.
 * Falls back to a free fetch-based approach if no API key is set.
 */

import { env } from '../../config/env';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  source?: string;
  date?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  answerBox?: string;
  knowledgePanel?: string;
  error?: string;
}

/**
 * Search the web using SerpAPI (Google Search JSON API)
 * Docs: https://serpapi.com/search-api
 */
export async function searchWeb(query: string, numResults: number = 5): Promise<SearchResponse> {
  if (!env.SERPAPI_API_KEY) {
    console.warn('[WebSearch] SERPAPI_API_KEY not set — web search unavailable');
    return {
      query,
      results: [],
      error: 'Web search is not configured. Please set SERPAPI_API_KEY in environment variables.',
    };
  }

  try {
    const params = new URLSearchParams({
      q: query,
      api_key: env.SERPAPI_API_KEY,
      engine: 'google',
      num: String(numResults),
      hl: 'en',
      gl: 'us',
    });

    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[WebSearch] SerpAPI error:', response.status, errText);
      return {
        query,
        results: [],
        error: `Search API returned ${response.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data: any = await response.json();

    // Extract organic results
    const results: SearchResult[] = (data.organic_results || [])
      .slice(0, numResults)
      .map((r: any) => ({
        title: r.title || '',
        link: r.link || '',
        snippet: r.snippet || '',
        source: r.source || r.displayed_link || '',
        date: r.date || '',
      }));

    // Extract answer box if available
    let answerBox: string | undefined;
    if (data.answer_box) {
      const ab = data.answer_box;
      if (ab.answer) {
        answerBox = ab.answer;
      } else if (ab.snippet) {
        answerBox = ab.snippet;
      } else if (ab.result) {
        answerBox = ab.result;
      }
    }

    // Extract knowledge panel if available
    let knowledgePanel: string | undefined;
    if (data.knowledge_graph) {
      const kg = data.knowledge_graph;
      const parts: string[] = [];
      if (kg.title) parts.push(`**${kg.title}**`);
      if (kg.type) parts.push(`Type: ${kg.type}`);
      if (kg.description) parts.push(kg.description);
      if (parts.length > 0) {
        knowledgePanel = parts.join('\n');
      }
    }

    return { query, results, answerBox, knowledgePanel };
  } catch (error: any) {
    console.error('[WebSearch] Error:', error?.message);
    return {
      query,
      results: [],
      error: `Search failed: ${error?.message || 'Unknown error'}`,
    };
  }
}

/**
 * Format search results into a context string for the AI prompt
 */
export function formatSearchResultsForPrompt(searchResponse: SearchResponse): string {
  if (searchResponse.error) {
    return `[Web search failed: ${searchResponse.error}]`;
  }

  const parts: string[] = [];
  parts.push(`=== Web Search Results for: "${searchResponse.query}" ===\n`);

  if (searchResponse.answerBox) {
    parts.push(`Quick Answer: ${searchResponse.answerBox}\n`);
  }

  if (searchResponse.knowledgePanel) {
    parts.push(`Knowledge Panel:\n${searchResponse.knowledgePanel}\n`);
  }

  if (searchResponse.results.length > 0) {
    searchResponse.results.forEach((r, i) => {
      parts.push(`[${i + 1}] ${r.title}`);
      parts.push(`    URL: ${r.link}`);
      if (r.source) parts.push(`    Source: ${r.source}`);
      if (r.date) parts.push(`    Date: ${r.date}`);
      parts.push(`    ${r.snippet}`);
      parts.push('');
    });
  } else {
    parts.push('No results found.');
  }

  return parts.join('\n');
}
