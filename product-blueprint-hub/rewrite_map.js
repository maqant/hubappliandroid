const fs = require('fs');
const path = require('path');

const file = 'C:/Users/MaquetAntoine/OneDrive - Bureau Yves Péchard s.a/Documents/Projets_Dev/hubappliandroid/hubappliandroid/product-blueprint-hub/apps/web/app/(app)/projects/[id]/design/map/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Rename DesignMapPage to DesignMapPageContent
content = content.replace('export default function DesignMapPage() {', 'function DesignMapPageContent() {');

// 2. Add ReactFlowProvider import
content = content.replace('MarkerType\n} from "reactflow";', 'MarkerType,\n  ReactFlowProvider,\n  useReactFlow\n} from "reactflow";');
content = content.replace('import { \n  useServices', 'import { analysisLogCollector } from "@/lib/export/analysis-log-collector";\nimport { \n  useServices');

// 3. Add FitViewHelper component before DesignMapPageContent
const fitViewHelper = `
function FitViewHelper({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (nodeCount > 0) {
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 800 });
        analysisLogCollector.addEntry({
          timestamp: new Date().toISOString(),
          level: "INFO",
          category: "CARTOGRAPHY",
          message: "CARTOGRAPHY_FITVIEW_EXECUTED",
          data: { fitViewExecuted: true }
        });
      }, 100);
    }
  }, [nodeCount, fitView]);
  return null;
}

`;
content = content.replace('function DesignMapPageContent() {', fitViewHelper + 'function DesignMapPageContent() {');

// 4. Wrap with ReactFlowProvider at the end
const providerWrapper = `
export default function DesignMapPage() {
  return (
    <ReactFlowProvider>
      <DesignMapPageContent />
    </ReactFlowProvider>
  );
}
`;
content = content + '\n' + providerWrapper;

// 5. Fix edge IDs
content = content.replace(/const sId = \`\$\{path\.id\}-\$\{sItem\.id\}-\$\{sLayer\}\`;/g, 'const sId = `${path.id}__${sItem.id}`;');
content = content.replace(/const tId = \`\$\{path\.id\}-\$\{tItem\.id\}-\$\{tLayer\}\`;/g, 'const tId = `${path.id}__${tItem.id}`;');
// Also need to use projectionId for the corridor edges.

// 6. Add telemetry in loadGraphData
content = content.replace('try {\n      const p = await svc.repos.projects.getById', `try {
      analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_DATA_LOADED" });
      const p = await svc.repos.projects.getById`);

content = content.replace('setFeaturePaths(paths);\n\n      const { edges: rawEdges }', `setFeaturePaths(paths);
      analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PATHS_COMPUTED", data: { pathCount: paths.length, proposalCount: proposals.length } });
      const { edges: rawEdges }`);

content = content.replace('const allVisualNodes = projectFeaturePathsToVisualNodes(activePaths, allProposals);', `const allVisualNodes = projectFeaturePathsToVisualNodes(activePaths, allProposals);
        analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PROJECTION_STARTED", data: { projection: 'EXPERIENCE_PATHS', selectedPathCount: activePaths.length } });`);

content = content.replace('setNodes(generatedNodes);\n      setEdges(generatedEdges);', `setNodes(generatedNodes);
      setEdges(generatedEdges);
      analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PROJECTION_COMPLETED", data: { projectedNodeCount: generatedNodes.length, projectedEdgeCount: generatedEdges.length, projection: projectionMode } });`);

// 7. Add button "Ajuster à l'écran"
content = content.replace('<button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-medium" onClick={loadGraphData}>\n            🔄 Rafraîchir\n          </button>', `<button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-medium" onClick={loadGraphData}>
            🔄 Rafraîchir
          </button>
          <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md font-medium border border-slate-300" onClick={() => document.getElementById('fit-view-trigger')?.click()}>
            🔍 Ajuster à l'écran
          </button>`);

const useRFHook = `  const { fitView } = useReactFlow();\n`;
content = content.replace('const svc = useServices();\n', `const svc = useServices();\n${useRFHook}`);
content = content.replace(`onClick={() => document.getElementById('fit-view-trigger')?.click()}`, `onClick={() => { fitView({ padding: 0.2, duration: 800 }); analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_FITVIEW_EXECUTED", data: { fitViewExecuted: true }}); }}`);

// 8. Inject FitViewHelper inside ReactFlow
content = content.replace('<Background />', '<FitViewHelper nodeCount={nodes.length} />\n              <Background />');

// 9. Fix empty states empty rendering
const emptyStateStr = `
          ) : featurePaths.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8 bg-slate-50">
              <p className="text-slate-500 text-lg font-medium">Aucun path d’expérience n’a pu être calculé.</p>
              <button className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg shadow" onClick={() => router.push(\`/projects/\${projectId}?tab=design\`)}>
                ✨ Ouvrir l'Atelier de Conception
              </button>
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8 bg-slate-50">
              <p className="text-slate-500 text-lg font-medium">Les paths existent, mais aucun nœud visuel n’a pu être construit. Consultez les diagnostics.</p>
            </div>
          ) : (
            <ReactFlow
`;
content = content.replace(/          \) \: nodes\.length === 0 \? \([\s\S]*?          \) \: \(\n            <ReactFlow/, emptyStateStr);

// 10. PNG Capture diagnostics
content = content.replace(`const res = await exportMapImageOnly(project?.title, () => canvasRef.current);`, `analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PNG_CAPTURE_STARTED" });
              const res = await exportMapImageOnly(project?.title, () => canvasRef.current);
              if (res.success) {
                analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "INFO", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PNG_CAPTURE_COMPLETED" });
              } else {
                analysisLogCollector.addEntry({ timestamp: new Date().toISOString(), level: "ERROR", category: "CARTOGRAPHY", message: "CARTOGRAPHY_PNG_CAPTURE_FAILED", data: { reason: res.error, nodeCount: nodes.length, edgeCount: edges.length, containerWidth: canvasRef.current?.offsetWidth, containerHeight: canvasRef.current?.offsetHeight } });
              }`);

fs.writeFileSync(file, content);
console.log('File successfully rewritten');
