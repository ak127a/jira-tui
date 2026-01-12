# Building a JIRA Integration for On-Premise (Data Center) Instances

## Conceptual Architecture for Supporting Both Cloud and On-Premise JIRA

---

## The Core Decision Point

When building a JIRA integration, the most fundamental architectural decision is: **where does the JIRA instance live?**

### Two Worlds, One API (Sort Of)

JIRA exists in two fundamentally different deployment models:

| Aspect | JIRA Cloud | JIRA Data Center (On-Premise) |
|--------|------------|-------------------------------|
| **Hosting** | Atlassian's infrastructure | Your infrastructure (AWS, Azure, on-prem) |
| **API Version** | v2 and v3 available | v2 only (stable, mature) |
| **User Identity** | `accountId` (UUID) | `username` (often email, but not always) |
| **Authentication** | API tokens, OAuth 2.0 | Passwords, PATs, OAuth 1.0a, OAuth 2.0 |
| **Base URL** | `*.atlassian.net` | Any hostname you control |
| **Rate Limits** | Strict, enforced by Atlassian | Configurable by your ops team |
| **Feature Availability** | Latest features first | Features lag Cloud by 6-12 months |

### The Configuration Challenge

The same JIRA REST API endpoints behave differently depending on where JIRA runs. Your integration must:

1. **Detect** which environment it's connecting to
2. **Adapt** request/response handling accordingly
3. **Fail gracefully** when Cloud-only features aren't available

---

## The Dual-Mode Architecture Pattern

### Concept: Environment-Aware Factory

The most effective pattern is to make your API client a **factory** that produces the appropriate client based on configuration:

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Application                          │
├─────────────────────────────────────────────────────────────┤
│                      Config Loader                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ cloud: true                                          │    │
│  │ base_url: https://company.atlassian.net             │    │
│  │ username: developer@company.com                      │    │
│  │ api_token: ****************************************  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Client Factory                        │
├─────────────────────────────────────────────────────────────┤
│  if config.cloud:                                           │
│      return CloudJiraClient(config)                         │
│  else:                                                      │
│      return DataCenterJiraClient(config)                    │
└─────────────────────────────────────────────────────────────┘
           │                           │
           ▼                           ▼
┌───────────────────────┐   ┌───────────────────────────────┐
│   CloudJiraClient     │   │   DataCenterJiraClient        │
├───────────────────────┤   ├───────────────────────────────┤
│ • API v2 or v3        │   │ • API v2 only                 │
│ • accountId for users │   │ • username for users          │
│ • Cloud auth flow     │   │ • On-prem auth flow           │
│ • Cloud endpoints     │   │ • On-prem endpoints           │
└───────────────────────┘   └───────────────────────────────┘
```

### Why This Pattern Works

1. **Clean Separation**: Each client handles its own environment's quirks
2. **Testability**: You can mock either client easily
3. **Extensibility**: Add new environments (future JIRA versions) without breaking existing code
4. **Configuration-Driven**: No code changes needed to support different environments

---

## Key Differences You Must Handle

### 1. Authentication Credentials

#### Cloud: Email + API Token

```yaml
# Cloud configuration
cloud: true
base_url: https://company.atlassian.net
username: developer@company.com  # Email associated with Atlassian account
api_token: your-cloud-api-token  # Generated from id.atlassian.com/manage/api-tokens
```

**How it works:**
- Basic Auth header: `Authorization: Basic base64(email:api_token)`
- No "password" involved—API tokens replace passwords
- Username MUST be the email address

#### On-Premise: Username + Password or PAT

```yaml
# On-Premise configuration
cloud: false
base_url: https://jira.company.com
username: jira_username      # Local JIRA username (may or may not be email)
api_token: your-pat-or-password  # Can be password OR Personal Access Token
```

**How it works:**
- Basic Auth header: `Authorization: Basic base64(username:password_or_pat)`
- Username is the local JIRA username (check JIRA user management)
- PAT support since JIRA v8.14+

### 2. User Identity: accountId vs username

This is the **single biggest source of bugs** in JIRA integrations.

#### Cloud Returns accountId

```json
{
  "self": "https://company.atlassian.net/rest/api/3/user?accountId=5b10a2844c20165700ede21g",
  "accountId": "5b10a2844c20165700ede21g",
  "displayName": "John Developer",
  "emailAddress": "john@company.com"
}
```

#### On-Premise Returns username (name)

```json
{
  "self": "https://jira.company.com/rest/api/2/user?username=johnd",
  "name": "johnd",
  "displayName": "John Developer",
  "emailAddress": "john@company.com"
}
```

**Your code must:**
- Store user identifiers as strings without assuming their format
- When creating users, use the correct field based on environment
- When querying users, look for `accountId` (Cloud) or `name` (On-Premise)

### 3. API Endpoints and Response Formats

#### Search Pagination

**Cloud (v3)** uses token-based pagination:
```json
// Request
POST /rest/api/3/search/jql
{
  "jql": "project = SCRUM",
  "maxResults": 50,
  "nextPageToken": "next-page-token-here"
}

// Response
{
  "startAt": 0,
  "maxResults": 50,
  "issues": [...],
  "nextPageToken": "next-page-token-here"
}
```

**On-Premise (v2)** uses offset-based pagination:
```json
// Request
POST /rest/api/2/search
{
  "jql": "project = SCRUM",
  "maxResults": 50,
  "startAt": 0
}

// Response
{
  "startAt": 0,
  "maxResults": 50,
  "issues": [...]
}
```

#### Project Listing

**Cloud** uses a sophisticated search endpoint:
```
GET /rest/api/3/project/search?startAt=0&maxResults=50
```

**On-Premise** uses a simpler legacy endpoint:
```
GET /rest/api/2/project
```

### 4. Feature Availability

Some features exist only in Cloud:

| Feature | Cloud | On-Premise | Your Strategy |
|---------|-------|------------|---------------|
| Approximate search count | ✅ `/search/approximate-count` | ❌ Not available | Hide feature or show message |
| Atlassian Document Format (ADF) | ✅ Full support | ⚠️ Limited | Use legacy formats for on-prem |
| User group management | ✅ Centralized | ⚠️ Local only | Different API calls per environment |
| Sprint search | ✅ `sprint in openSprints()` | ⚠️ May vary | Test JQL in target environment |

---

## Recommended Application Structure

```
your-jira-app/
├── config/
│   ├── __init__.py
│   ├── loader.py          # Load config from YAML/env vars
│   └── models.py          # Pydantic models for config validation
│
├── clients/
│   ├── __init__.py
│   ├── base.py            # Abstract base class for JIRA clients
│   ├── cloud.py           # Cloud-specific implementation
│   └── datacenter.py      # On-Premise-specific implementation
│
├── auth/
│   ├── __init__.py
│   ├── basic.py           # Basic authentication helper
│   └── bearer.py          # Bearer token helper
│
└── main.py                # Application entry point
```

### Example: Config Models

```python
# config/models.py
from pydantic import BaseModel

class JiraConfig(BaseModel):
    cloud: bool = True
    base_url: str
    username: str
    api_token: str
    use_bearer: bool = False
    
    @property
    def requires_bearer(self) -> bool:
        return self.use_bearer or not self.cloud
```

### Example: Factory Pattern

```python
# clients/factory.py
from .base import BaseJiraClient
from .cloud import CloudJiraClient
from .datacenter import DataCenterJiraClient
from config.models import JiraConfig

def create_jira_client(config: JiraConfig) -> BaseJiraClient:
    if config.cloud:
        return CloudJiraClient(config)
    else:
        return DataCenterJiraClient(config)
```

### Example: Base Client

```python
# clients/base.py
from abc import ABC, abstractmethod
import httpx
from config.models import JiraConfig

class BaseJiraClient(ABC):
    def __init__(self, config: JiraConfig):
        self.config = config
        self.base_url = config.base_url.rstrip('/')
        self._client = self._create_client()
    
    @abstractmethod
    def _create_client(self) -> httpx.Client:
        pass
    
    @abstractmethod
    async def search_issues(self, jql: str, **kwargs) -> dict:
        pass
    
    @abstractmethod
    async def get_user(self, user_id: str) -> dict:
        pass
```

---

## Common Pitfalls and How to Avoid Them

### Pitfall 1: Hardcoding accountId Expectations

**Wrong:**
```python
def get_user_identifier(user_data):
    return user_data['accountId']  # Will fail on on-prem
```

**Right:**
```python
def get_user_identifier(user_data, is_cloud: bool):
    if is_cloud:
        return user_data.get('accountId')
    else:
        return user_data.get('name')  # On-prem uses 'name' field
```

### Pitfall 2: Ignoring Feature Gaps

**Wrong:**
```python
# Assuming all environments support this
count = await client.get_approximate_count(jql)
```

**Right:**
```python
async def get_approximate_count(client, jql: str) -> int | None:
    if hasattr(client, 'get_approximate_count'):
        return await client.get_approximate_count(jql)
    else:
        # Fallback or notify user
        return None
```

### Pitfall 3: Wrong URL Construction

**Wrong:**
```python
url = f"https://company.atlassian.net/browse/{issue_key}"
# Won't work for on-prem instances
```

**Right:**
```python
# Store base URL in config, construct dynamically
url = f"{config.base_url}/browse/{issue_key}"
```

### Pitfall 4: Email vs Username Confusion

**Wrong:**
```python
# Assuming username is always email
auth = basic_auth(config.username, config.api_token)
```

**Right:**
```python
# Username format differs by environment
if config.cloud:
    # Cloud: username must be email
    auth = basic_auth(config.username, config.api_token)
else:
    # On-prem: username is local username
    auth = basic_auth(config.username, config.api_token)
```

---

## Minimum Viable Configuration for On-Premise Support

To support on-premise JIRA, your application needs:

```yaml
# Minimal config structure
jira:
  cloud: false                           # CRITICAL: Enables on-prem mode
  base_url: https://jira.company.com      # Your on-prem URL
  username: your_jira_username           # Local username
  api_token: your_password_or_pat        # Password or PAT
  verify_ssl: true                       # SSL certificate handling
```

### Optional Advanced Settings

```yaml
jira:
  cloud: false
  base_url: https://jira.company.com
  username: admin
  api_token: *******
  
  # Advanced options
  timeout: 30                            # Request timeout in seconds
  retries: 3                             # Auto-retry on failure
  cache_ttl: 300                         # Cache API responses
  
  # SSL/TLS options (if using self-signed certs)
  verify_ssl: false                      # NOT RECOMMENDED for production
  ca_bundle: /path/to/ca-bundle.crt      # Or use system certificates
  client_cert: /path/to/client.crt       # For mutual TLS
  client_key: /path/to/client.key
```

---

## Testing Your Integration

### Test Against Both Environments

1. **Cloud Testing**: Create a free Atlassian Cloud trial
2. **On-Premise Testing**: Use Docker for a local JIRA instance
   ```bash
   docker run -d --name jira \
     -p 8080:8080 \
     atlassian/jira-software
   ```

### Test Matrix

| Test Case | Cloud | On-Premise |
|-----------|-------|------------|
| Authentication | ✅ | ✅ |
| Issue search | ✅ | ✅ |
| User lookup | ✅ | ✅ |
| Project listing | ✅ | ✅ |
| Create issue | ✅ | ✅ |
| Update issue | ✅ | ✅ |
| Add comment | ✅ | ✅ |
| Worklog operations | ✅ | ✅ |
| Unsupported features | Show message | Show message |

---

## Summary: What "cloud=false" Really Means

Setting `cloud=false` in a JIRA integration tells the application:

1. **"Connect to JIRA at this custom base URL"** (not a Atlassian-hosted instance)
2. **"Use JIRA Data Center API v2"** (not Cloud v2/v3)
3. **"Expect username-based auth"** (not email-based)
4. **"Look for 'name' field in user responses"** (not 'accountId')
5. **"Use offset-based pagination"** (not token-based)
6. **"Some Cloud-only features are unavailable"** (graceful degradation needed)
7. **"SSL certificates are your responsibility"** (may need custom CA bundles)

---

## Quick Reference: Cloud vs On-Premise

| Aspect | Cloud | On-Premise |
|--------|-------|------------|
| API version | v2, v3 | v2 |
| Base URL pattern | `*.atlassian.net` | Any hostname |
| User ID field | `accountId` | `name` |
| Username format | Email address | Local username |
| Auth token type | API token | Password or PAT |
| Pagination | `nextPageToken` | `startAt` offset |
| Approximate count | Available | Not available |
| ADF support | Full | Limited |
| Rate limits | Strict | Configurable |
| SSL certs | Atlassian-managed | You manage |

---

This document provides the conceptual foundation for building JIRA integrations that work seamlessly across both Cloud and On-Premise environments. The key is making environment awareness a first-class architectural concern, not an afterthought.
