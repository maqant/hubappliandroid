"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  Node, 
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection
} from "reactflow";
import "reactflow/dist/style.css";

const initialNodes: Node[] = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Intention: Aide à la conception' }, type: 'input' },
  { id: '2', position: { x: 0, y: 100 }, data: { label: 'Hypothèse: Agents spécialisés' } },
];
const initialEdges: Edge[] = [{ id: 'e1-2', source: '1', target: '2' }];

export default function DesignMapPage() {
  const { id } = useParams();
  const router = useRouter();
  const projectId = id as string;

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="p-4 border-b border-border flex justify-between bg-surface items-center">
        <div className="flex gap-4 items-center">
          <button className="btn btn-secondary" onClick={() => router.push(`/projects/${projectId}?tab=design`)}>
            &larr; Retour à l&apos;atelier
          </button>
          <h2 className="m-0">Cartographie d&apos;Impact</h2>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary">Analyser l&apos;impact</button>
        </div>
      </div>
      <div className="flex-1" style={{ height: 'calc(100vh - 140px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
