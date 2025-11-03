pushd %~dp0
cd ..
set DANGEROUSLY_OMIT_AUTH=1
npx @modelcontextprotocol/inspector npx tsx ./scripts/genesys/genesys-mcp.ts
popd