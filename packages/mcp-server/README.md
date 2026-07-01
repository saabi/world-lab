# @world-lab/mcp-server

> **Status: early scaffold, not yet a working MCP server.** This package currently exports
> plain query functions (`listPrimitives`, `validateGraphDocument`, `describeNode`) over
> [`@world-lab/graph`](../graph)'s primitive registry. It has no
> [Model Context Protocol](https://modelcontextprotocol.io) SDK dependency and no server/
> transport wiring yet — despite the package name, there is nothing here an MCP client can
> currently connect to. Treat it as a foundation for a future real MCP server, not a usable
> one today.

```ts
import { listPrimitives, validateGraphDocument, describeNode } from '@world-lab/mcp-server';
```

See `_docs/architecture/procedural-graph/implementation-plan.md` for where this was scoped as
an eventual AI-assistant integration point for the graph engine.
