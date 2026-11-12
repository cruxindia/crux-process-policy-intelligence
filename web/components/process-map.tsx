"use client";
// Live, interactive process map (React Flow + dagre auto-layout). Read-only: corrections go through the conversation,
// so the map always reflects what the employee actually said. Open decision branches are flagged as gaps, never filled in.
import { useMemo, useRef } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

export type FlowNode = { id: string; type: "start" | "step" | "decision" | "handover" | "end"; label: string; actor?: string; system?: string };
export type FlowEdge = { from: string; to: string; label?: string };
export type ProcessFlow = { nodes: FlowNode[]; edges: FlowEdge[] };

type Data = { n: FlowNode; gap: boolean };
const W = 210, H = 64;

function Box({ data }: NodeProps<Node<Data>>) {
  const { n, gap } = data;
  return (
    <div className={`pm-node pm-${n.type}${gap ? " pm-gap" : ""}`} title={gap ? "Not yet described: what happens on the other path?" : undefined}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      {n.type === "decision" && <span className="pm-kind">Decision</span>}
      {n.type === "handover" && <span className="pm-kind">Handover</span>}
      <div className="pm-label">{n.label}</div>
      {(n.actor || n.system) && <div className="pm-meta">{[n.actor, n.system].filter(Boolean).join(" · ")}</div>}
      {gap && <div className="pm-gap-tag">? other path not described yet</div>}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { box: Box };

/** Top-down layout. Pure: same flow, same picture. */
export function layout(flow: ProcessFlow): { nodes: Node<Data>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 56, marginx: 10, marginy: 10 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of flow.nodes) g.setNode(n.id, { width: W, height: n.type === "decision" ? H + 16 : H });
  const ids = new Set(flow.nodes.map((n) => n.id));
  const edges = flow.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  for (const e of edges) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const outCount = new Map<string, number>();
  for (const e of edges) outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
  return {
    nodes: flow.nodes.map((n) => {
      const p = g.node(n.id);
      return { id: n.id, type: "box", position: { x: (p?.x ?? 0) - W / 2, y: (p?.y ?? 0) - H / 2 }, draggable: false,
        data: { n, gap: n.type === "decision" && (outCount.get(n.id) ?? 0) < 2 } };
    }),
    edges: edges.map((e, i) => ({ id: `${e.from}>${e.to}:${i}`, source: e.from, target: e.to, label: e.label, type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed }, labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 4 })),
  };
}

export function ProcessMap({ flow, height = 520 }: { flow: ProcessFlow | null | undefined; height?: number }) {
  const g = useMemo(() => layout(flow ?? { nodes: [], edges: [] }), [flow]);
  const box = useRef<HTMLDivElement>(null);
  // Fit the whole map when it is readable; otherwise keep text readable and start at the top (the trigger), centred.
  const onInit = (rf: ReactFlowInstance<Node<Data>, Edge>) => {
    const el = box.current; if (!el || !g.nodes.length) return;
    const xs = g.nodes.map((n) => n.position.x), ys = g.nodes.map((n) => n.position.y);
    const w = Math.max(...xs) + W - Math.min(...xs), h = Math.max(...ys) + H + 16 - Math.min(...ys);
    const fit = Math.min(el.clientWidth / (w + 40), el.clientHeight / (h + 40), 1.1);
    const zoom = Math.max(fit, 0.75);
    void rf.setViewport({ zoom, x: (el.clientWidth - w * zoom) / 2 - Math.min(...xs) * zoom,
      y: fit >= 0.75 ? (el.clientHeight - h * zoom) / 2 - Math.min(...ys) * zoom : 16 - Math.min(...ys) * zoom });
  };
  if (!flow?.nodes?.length) return <div className="pm-empty muted small">The map appears here as you describe the steps of this work.</div>;
  return (
    <div ref={box} className="pm-wrap" style={{ height }} data-testid="process-map" aria-label="Process map">
      <ReactFlow nodes={g.nodes} edges={g.edges} nodeTypes={nodeTypes} onInit={onInit} minZoom={0.2} maxZoom={1.6} panOnScroll
        nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: false }}>
        <Background gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
