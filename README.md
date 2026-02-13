# AusLaw MCP

Model Context Protocol (MCP) server for Australian and New Zealand legal research. Searches AustLII for case law and legislation, retrieves full-text judgements with paragraph numbers preserved, and supports OCR for scanned PDFs.

<a href="https://glama.ai/mcp/servers/@russellbrenner/auslaw-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@russellbrenner/auslaw-mcp/badge" alt="AusLaw MCP server" />
</a>

**Status**: ✅ Working MVP with intelligent search relevance

## Features

### Current Capabilities

- ✅ **Case law search**: Natural language queries across all Australian and NZ jurisdictions
- ✅ **All jurisdictions**: Commonwealth, all States/Territories (VIC, NSW, QLD, SA, WA, TAS, NT, ACT), and New Zealand
- ✅ **Intelligent search relevance**: Auto-detects case name queries vs topic searches
  - Case name queries (e.g., "Donoghue v Stevenson") use relevance sorting
  - Topic queries (e.g., "negligence duty of care") use date sorting for recent cases
- ✅ **Multiple search methods**: Title-only, phrase, boolean, proximity searches
- ✅ **Pagination**: Retrieve additional pages of results with offset parameter
- ✅ **Legislation search**: Find Australian and NZ legislation
- ✅ **Primary sources only**: Filters out journal articles and commentary
- ✅ **Citation extraction**: Extracts neutral citations `[2025] HCA 26` and reported citations `(2024) 350 ALR 123`
- ✅ **jade.io search**: Search jade.io for cases by cross-referencing AustLII results with jade.io metadata
- ✅ **jade.io citation search**: Find jade.io articles by neutral citation
- ✅ **Multi-source merging**: Merge and deduplicate results from AustLII and jade.io (jade.io preferred)
- ✅ **jade.io URL support**: Fetch document text from jade.io URLs (requires user access)
- ✅ **jade.io article resolution**: Resolve jade.io article metadata by ID
- ✅ **jade.io citation lookup**: Generate jade.io lookup URLs from neutral citations
- ✅ **Paragraph preservation**: Keeps `[N]` paragraph numbers for pinpoint citations
- ✅ **Multiple formats**: JSON, text, markdown, or HTML output
- ✅ **Document retrieval**: Full text from HTML and PDF sources (AustLII, jade.io)
- ✅ **OCR support**: Tesseract OCR fallback for scanned PDFs

### Roadmap

- ✅ **jade.io search**: Search jade.io by cross-referencing AustLII results with jade.io article metadata (no API required)
- ✅ **Multi-source integration**: Merge and deduplicate results from AustLII and jade.io
- 🔜 **Page numbers**: Will extract page numbers from reported versions
- 🔜 **Authority ranking**: Will prioritise reported over unreported judgements

See [ROADMAP.md](docs/ROADMAP.md) for detailed development plans.

## Quick Start

### 1. Clone and Build

```bash
git clone https://github.com/russellbrenner/auslaw-mcp.git
cd auslaw-mcp
npm install
npm run build
```

For local development with hot reload:

```bash
npm run dev
```

### 2. Configure Your MCP Client

> **Important**: You must build the project (`npm run build`) before configuring any client. All clients launch the compiled `dist/index.js`.

#### Claude Desktop

Edit your Claude Desktop configuration file:

| OS      | Path                                                              |
| ------- | ----------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| Linux   | `~/.config/Claude/claude_desktop_config.json`                     |

Add the following (replace `/path/to/auslaw-mcp` with your actual install path):

```json
{
  "mcpServers": {
    "auslaw-mcp": {
      "command": "node",
      "args": ["/path/to/auslaw-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

#### Claude Code (CLI)

Register the MCP server using the `claude mcp add` command:

```bash
claude mcp add auslaw-mcp node /path/to/auslaw-mcp/dist/index.js
```

To verify it was added:

```bash
claude mcp list
```

#### Codex (OpenAI CLI)

Add auslaw-mcp as a server in your Codex MCP configuration file (`~/.codex/config.json` or project-level `.codex/config.json`):

```json
{
  "mcpServers": {
    "auslaw-mcp": {
      "command": "node",
      "args": ["/path/to/auslaw-mcp/dist/index.js"]
    }
  }
}
```

#### Cursor

Open **Settings → MCP** and add a new server with:

- **Name**: `auslaw-mcp`
- **Command**: `node /path/to/auslaw-mcp/dist/index.js`

Or edit `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "auslaw-mcp": {
      "command": "node",
      "args": ["/path/to/auslaw-mcp/dist/index.js"]
    }
  }
}
```

### Docker Deployment

```bash
# Build the Docker image
docker build -t auslaw-mcp:latest .

# Run with Docker Compose
docker-compose up

# Or run directly
docker run -it --rm auslaw-mcp:latest
```

See [docs/DOCKER.md](docs/DOCKER.md) for detailed Docker deployment instructions.

### Kubernetes (k3s) Deployment

```bash
# Build and import image to k3s nodes
docker build -t auslaw-mcp:latest .
docker save auslaw-mcp:latest -o auslaw-mcp.tar

# Deploy to k3s cluster
kubectl apply -f k8s/
```

See [k8s/README.md](k8s/README.md) for complete Kubernetes deployment guide.

## Example Queries for AI Assistants

Once the MCP is connected, you can ask an AI assistant like Claude natural language questions. Here are examples organised by use case:

### Finding Recent Decisions

> "What cases were decided by Australian courts today?"

> "Show me the latest Federal Court decisions from this week"

> "Find recent Victorian Supreme Court cases about contract disputes"

> "What are the newest High Court judgments?"

### Researching Legal Topics

> "Find Australian cases about duty of care in professional negligence"

> "Search for cases dealing with unfair dismissal in the construction industry"

> "What are the leading cases on misleading and deceptive conduct under the ACL?"

> "Find cases about breach of directors' duties in the last 2 years"

> "Search for NSW cases involving defamation on social media"

### Finding Specific Cases

> "Find the Mabo case"

> "Look up Donoghue v Stevenson"

> "Find the High Court decision in Palmer v McGowan"

> "Search for Re Wakim - the constitutional case about cross-vesting"

### Comparing Jurisdictions

> "Compare how Victoria and New South Wales courts have treated non-compete clauses"

> "Find Queensland cases about adverse possession"

> "What's the leading New Zealand case on unjust enrichment?"

### Legislation Research

> "Find the Privacy Act"

> "Search for legislation about workplace health and safety in Victoria"

> "What Commonwealth legislation deals with competition law?"

> "Find the New Zealand equivalent of the Australian Consumer Law"

### Deep Research Tasks

> "Find cases that have considered section 52 of the Trade Practices Act and summarise how courts have interpreted 'misleading and deceptive conduct'"

> "Research the development of the 'reasonable person' test in negligence across Australian jurisdictions"

> "Find all High Court cases about constitutional implied freedoms in the last 10 years and identify the key principles"

### jade.io Search

> "Search jade.io for cases about negligence duty of care"

> "Find the jade.io article for [2008] NSWSC 323"

> "Search for Mabo v Queensland and include jade.io results"

### Document Retrieval

> "Fetch the full text of [2024] HCA 1 and summarise the key holdings"

> "Get the judgment in Mabo v Queensland (No 2) and explain the doctrine of native title it established"

## Available Tools

### search_cases

Search Australian and New Zealand case law.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Search query (e.g., "negligence duty of care", "Mabo v Queensland") |
| `jurisdiction` | No | Filter: `cth`, `vic`, `nsw`, `qld`, `sa`, `wa`, `tas`, `nt`, `act`, `federal`, `nz`, `other` |
| `limit` | No | Max results 1-50 (default 10) |
| `sortBy` | No | `auto` (default), `relevance`, or `date` |
| `method` | No | `auto`, `title`, `phrase`, `all`, `any`, `near`, `boolean` |
| `offset` | No | Skip first N results for pagination (e.g., 50 for page 2) |
| `includeJade` | No | Include jade.io results (merged and deduplicated) |
| `format` | No | `json` (default), `text`, `markdown`, `html` |

**Search Methods:**
| Method | Description | Best For |
|--------|-------------|----------|
| `auto` | AustLII decides | General use |
| `title` | Search case names only | Finding specific cases by name |
| `phrase` | Exact phrase match | Legal terms of art |
| `all` | All words must appear | Precise searches |
| `any` | Any word matches | Broad searches |
| `near` | Words near each other | Conceptual searches |
| `boolean` | Raw SINO query syntax | Power users |

**Examples:**

Find a specific case:

```json
{
  "query": "Donoghue v Stevenson",
  "method": "title",
  "limit": 5
}
```

Recent NSW cases on a topic:

```json
{
  "query": "adverse possession",
  "jurisdiction": "nsw",
  "sortBy": "date",
  "limit": 10
}
```

Exact phrase search:

```json
{
  "query": "duty of care",
  "method": "phrase",
  "jurisdiction": "cth",
  "limit": 20
}
```

Pagination (get results 51-100):

```json
{
  "query": "contract breach",
  "limit": 50,
  "offset": 50
}
```

### search_legislation

Search Australian and New Zealand legislation.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Search query |
| `jurisdiction` | No | Filter: `cth`, `vic`, `nsw`, `qld`, `sa`, `wa`, `tas`, `nt`, `act`, `nz`, `other` |
| `limit` | No | Max results 1-50 (default 10) |
| `sortBy` | No | `auto` (default), `relevance`, or `date` |
| `method` | No | `auto`, `title`, `phrase`, `all`, `any`, `near`, `legis`, `boolean` |
| `offset` | No | Skip first N results for pagination |
| `includeJade` | No | Include jade.io results (merged and deduplicated) |
| `format` | No | `json` (default), `text`, `markdown`, `html` |

**Example:**

```json
{
  "query": "Privacy Act",
  "jurisdiction": "cth",
  "method": "legis",
  "limit": 10
}
```

### search_jade

Search jade.io for Australian case law by cross-referencing AustLII results with jade.io article metadata. Works without jade.io API access.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Search query (e.g., "negligence duty of care") |
| `jurisdiction` | No | Filter: `cth`, `vic`, `nsw`, `qld`, `sa`, `wa`, `tas`, `nt`, `act`, `federal`, `nz`, `other` |
| `limit` | No | Max results 1-50 (default 10) |
| `sortBy` | No | `auto` (default), `relevance`, or `date` |
| `type` | No | `case` or `legislation` |

**Example:**

```json
{
  "query": "Mabo v Queensland",
  "jurisdiction": "cth",
  "limit": 5
}
```

### search_jade_by_citation

Find a jade.io article by neutral citation. Resolves the citation to jade.io article metadata.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `citation` | Yes | Neutral citation (e.g., `[2008] NSWSC 323`) |

**Example:**

```json
{
  "citation": "[2008] NSWSC 323"
}
```

### fetch_document_text

Fetch full text from a case or legislation URL. Supports HTML and PDF with OCR fallback.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `url` | Yes | URL of the document (AustLII or jade.io) |
| `format` | No | `json` (default), `text`, `markdown`, `html` |

**Example:**

```json
{
  "url": "https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/cth/HCA/1992/23.html"
}
```

### resolve_jade_article

Resolve metadata for a jade.io article by its numeric ID. Returns case name, neutral citation, jurisdiction, and year.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `articleId` | Yes | jade.io article numeric ID (positive integer) |

**Example:**

```json
{
  "articleId": 68901
}
```

### jade_citation_lookup

Generate a jade.io lookup URL for a given neutral citation. Returns a URL that opens jade.io with the citation search.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `citation` | Yes | Neutral citation string (e.g., `[2008] NSWSC 323`) |

**Example:**

```json
{
  "citation": "[2008] NSWSC 323"
}
```

## Jurisdictions

| Code      | Jurisdiction                   |
| --------- | ------------------------------ |
| `cth`     | Commonwealth of Australia      |
| `federal` | Federal courts (alias for cth) |
| `vic`     | Victoria                       |
| `nsw`     | New South Wales                |
| `qld`     | Queensland                     |
| `sa`      | South Australia                |
| `wa`      | Western Australia              |
| `tas`     | Tasmania                       |
| `nt`      | Northern Territory             |
| `act`     | Australian Capital Territory   |
| `nz`      | New Zealand                    |
| `other`   | All jurisdictions (no filter)  |

## Running Tests

```bash
npm test
```

Test scenarios include:

1. **Negligence and duty of care** - Personal injury law searches
2. **Contract disputes** - Commercial law and breach of contract
3. **Constitutional law** - High Court constitutional matters
4. **Employment law** - Unfair dismissal and workplace relations
5. **Property and land law** - Native title and land rights disputes

## Project Structure

```
src/
├── services
│   ├── austlii.ts # AustLII search integration
│   ├── fetcher.ts # Document text retrieval (HTML/PDF/OCR)
│   └── jade.ts # jade.io search, article resolution & cross-referencing
├── test
│   ├── unit
│   │   ├── constants.test.ts
│   │   ├── errors.test.ts
│   │   ├── formatter.test.ts
│   │   └── logger.test.ts
│   ├── jade.test.ts
│   └── scenarios.test.ts
├── utils
│   ├── formatter.ts # Output formatting (JSON/text/markdown/html)
│   └── logger.ts # Logging utility
├── config.ts # Configuration management
├── constants.ts # Shared constants
├── errors.ts # Error types and handling
└── index.ts # MCP server & tool registration

docs/
├── architecture.md # Architecture documentation
├── DOCKER.md # Docker deployment guide
└── ROADMAP.md # Development roadmap

k8s/
├── configmap.yaml # Configuration for k8s
├── deployment.yaml # Deployment specification
├── namespace.yaml # Kubernetes namespace
├── README.md # Kubernetes deployment guide
└── service.yaml # Service definition
```

## Deployment

### Docker

Quick start:

```bash
./build.sh              # Build Docker image
docker-compose up       # Run locally
```

See [docs/DOCKER.md](docs/DOCKER.md) for detailed Docker deployment instructions.

### Kubernetes (k3s)

Quick start:

```bash
./build.sh              # Build and export image
# Import to k3s nodes (see k8s/README.md)
./deploy-k8s.sh         # Deploy to cluster
```

See [k8s/README.md](k8s/README.md) for complete k3s deployment guide and [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) for a comprehensive deployment checklist.

### Configuration

All configuration can be customized via environment variables:

- `AUSTLII_SEARCH_BASE` - AustLII search endpoint
- `AUSTLII_REFERER` - Referer header
- `AUSTLII_USER_AGENT` - User agent string
- `AUSTLII_TIMEOUT` - Request timeout (ms)
- `JADE_BASE_URL` - jade.io base URL
- `JADE_USER_AGENT` - jade.io user agent string
- `JADE_TIMEOUT` - jade.io request timeout (ms)
- `OCR_LANGUAGE` - Tesseract OCR language
- `OCR_OEM`, `OCR_PSM` - OCR engine settings
- `DEFAULT_SEARCH_LIMIT` - Default search results
- `MAX_SEARCH_LIMIT` - Maximum search results
- `DEFAULT_OUTPUT_FORMAT` - Default format (json/text/markdown/html)
- `DEFAULT_SORT_BY` - Default sort order (auto/relevance/date)
- `LOG_LEVEL` - Logging level (0=DEBUG, 1=INFO, 2=WARN, 3=ERROR)

See [config.yaml](config.yaml) for defaults and `.env.example` for a template.

## Data Sources and Attribution

This project retrieves legal data from publicly accessible databases.

### AustLII (Australasian Legal Information Institute)

- Website: https://www.austlii.edu.au
- Terms of Use: https://www.austlii.edu.au/austlii/terms.html
- AustLII provides free access to Australian and New Zealand legal materials

### jade.io

- Search integration works by cross-referencing AustLII results with jade.io article metadata
- Maximum 5 concurrent jade.io article resolutions to avoid overwhelming the server
- Users must have their own jade.io subscription for full document access
- This tool does not bypass jade.io's access controls
- Respects jade.io's terms of service

### Fair Use

Please use this tool responsibly:

- Implement reasonable delays between requests
- Cache results when appropriate
- Don't overload public legal databases
- Consider [supporting AustLII](https://www.austlii.edu.au/austlii/sponsors.html) through donations

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for full contribution guidelines and [AGENTS.md](AGENTS.md) for AI agent instructions.

**Key principles**:

- Primary sources only (no journal articles)
- Citation accuracy is paramount
- All tests must pass before committing
- Real-world testing (hits live AustLII)

## Disclaimer

**This tool is for legal research purposes only and does not constitute legal advice.**

- Search results may not be comprehensive and should not be relied upon as a complete statement of the law
- AustLII databases may not include all decisions or the most recent updates
- Always verify citations and check for subsequent treatment of cases
- Legal advice should be sought from a qualified legal practitioner for any specific legal matter
- The authors and contributors accept no liability for any loss or damage arising from use of this tool

## License

MIT
