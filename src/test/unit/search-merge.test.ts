import { describe, it, expect } from "vitest";
import { mergeCaseSearchResults } from "../../services/search-merge.js";
import type { SearchResult } from "../../services/austlii.js";

function makeAustlii(overrides: Partial<SearchResult>): SearchResult {
  return {
    title: "AustLII Case",
    url: "https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/cth/HCA/1992/23.html",
    source: "austlii",
    type: "case",
    ...overrides,
  };
}

function makeJade(overrides: Partial<SearchResult>): SearchResult {
  return {
    title: "BarNet Jade Case",
    url: "https://jade.io/article/67683",
    source: "jade",
    type: "case",
    ...overrides,
  };
}

describe("mergeCaseSearchResults", () => {
  it("prefers jade.io result when neutral citations collide", () => {
    const austliiResults = [
      makeAustlii({
        title: "Mabo v Queensland (No 2) [1992] HCA 23",
        neutralCitation: "[1992] HCA 23",
      }),
    ];
    const jadeResults = [
      makeJade({
        title: "Mabo v Queensland (No 2) [1992] HCA 23",
        neutralCitation: "[1992] HCA 23",
        reportedCitation: "(1992) 175 CLR 1",
      }),
    ];

    const merged = mergeCaseSearchResults(austliiResults, jadeResults);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe("jade");
    expect(merged[0]?.reportedCitation).toBe("(1992) 175 CLR 1");
  });

  it("retains distinct results when neutral citations differ", () => {
    const austliiResults = [
      makeAustlii({ neutralCitation: "[2024] HCA 1", title: "Case A [2024] HCA 1" }),
    ];
    const jadeResults = [
      makeJade({ neutralCitation: "[2024] HCA 2", title: "Case B [2024] HCA 2" }),
    ];

    const merged = mergeCaseSearchResults(austliiResults, jadeResults);
    expect(merged).toHaveLength(2);
  });

  it("deduplicates fallback-url results without neutral citations by URL", () => {
    const austliiResults = [
      makeAustlii({
        title: "Uncited Case",
        neutralCitation: undefined,
        url: "https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/nsw/NSWSC/2024/1.html",
      }),
    ];
    const jadeResults: SearchResult[] = [];

    const merged = mergeCaseSearchResults(austliiResults, jadeResults);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.url).toContain("/NSWSC/2024/1.html");
  });

    const merged = mergeCaseSearchResults(austliiResults, jadeResults, 2);
    expect(merged).toHaveLength(2);
    // jade result should occupy the first slot (jade is preferred / iterated first)
    expect(merged[0]?.source).toBe("jade");
    expect(merged[0]?.neutralCitation).toBe("[2024] HCA 3");
});
