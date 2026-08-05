/** Interactive decision-flow viz (react-flow). Renders the path the AI actually
 * walked (stage-1 gate trace + stage-2 decision trace + terminal) as a vertical
 * chain of cards; clicking a node highlights the root→node path. Pan/zoom,
 * Controls and MiniMap come from react-flow. Light theme to match the K-line tab.
 *
 * The static tree (是/否 outcome text for edge labels) is fetched once from
 * /api/decision-tree; the graph topology is rebuilt from the trace, since
 * 二元决策.txt has no explicit children links. */
import { useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '../../api/client'
import type {
  DecisionTreeStatic,
  GateTraceItem,
  Terminal,
  TraceItem,
} from '../../api/types'
import {
  answerColor,
  branchSide,
  mergeTraces,
  terminalColor,
  terminalOutcome,
  type MergedTraceItem,
  type Phase,
} from '../../utils/decisionTrace'

interface TraceNodeData {
  kind: 'trace' | 'terminal'
  nodeId: string
  section?: string
  question?: string
  answer?: string
  barRange?: string
  phase: Phase
  outcome?: string
  label?: string
  [key: string]: unknown
}

interface Props {
  gateTrace?: GateTraceItem[]
  decisionTrace?: TraceItem[]
  terminal?: Terminal
}

const DY = 178

function buildFlow(
  merged: MergedTraceItem[],
  terminal: Terminal | undefined,
  tree: DecisionTreeStatic | null,
): { nodes: Node<TraceNodeData>[]; edges: Edge[] } {
  const nodes: Node<TraceNodeData>[] = []
  const edges: Edge[] = []
  merged.forEach((it, i) => {
    nodes.push({
      id: `n${i}`,
      type: 'trace',
      position: { x: 0, y: i * DY },
      data: {
        kind: 'trace',
        nodeId: it.node_id ?? '',
        section: it.section,
        question: it.question,
        answer: it.answer,
        barRange: it.bar_range,
        phase: it.phase,
      },
    })
    if (i > 0) {
      const prev = merged[i - 1]
      const side = branchSide(prev.answer)
      let label = ''
      const prevTreeNode = prev.node_id ? tree?.node_index?.[prev.node_id] : undefined
      if (side === 'yes') label = prevTreeNode?.branch_yes || '继续下一步'
      else if (side === 'no') label = prevTreeNode?.branch_no || '等待 / 切换逻辑'
      edges.push({
        id: `e${i}`,
        source: `n${i - 1}`,
        target: `n${i}`,
        label,
        type: 'smoothstep',
      })
    }
  })
  const outcome = terminalOutcome(terminal)
  if (outcome || terminal?.label) {
    const idx = merged.length
    nodes.push({
      id: 'terminal',
      type: 'terminal',
      position: { x: 0, y: idx * DY },
      data: {
        kind: 'terminal',
        nodeId: terminal?.node_id ?? '',
        outcome,
        label: terminal?.label,
        phase: 'stage2',
      },
    })
    if (idx > 0) {
      edges.push({
        id: `e${idx}`,
        source: `n${idx - 1}`,
        target: 'terminal',
        type: 'smoothstep',
      })
    }
  }
  return { nodes, edges }
}

function TraceNodeCard({ data }: NodeProps) {
  const d = data as TraceNodeData
  const phaseColor = d.phase === 'stage1' ? '#4338ca' : '#1d4ed8'
  return (
    <div
      style={{
        width: 264,
        background: '#fff',
        border: `1px solid ${d.phase === 'stage1' ? '#c7d2fe' : '#bfdbfe'}`,
        borderRadius: 8,
        padding: 10,
        fontSize: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <span style={{ fontWeight: 600, color: '#374151' }}>
          {d.nodeId}
          {d.section ? ` · ${d.section}` : ''}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 4,
            background: d.phase === 'stage1' ? '#eef2ff' : '#eff6ff',
            color: phaseColor,
          }}
        >
          {d.phase === 'stage1' ? '闸门' : '决策'}
        </span>
      </div>
      <div style={{ color: '#4b5563', marginBottom: 6, lineHeight: 1.4 }}>{d.question}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {d.answer && (
          <span style={{ fontWeight: 700, color: answerColor(d.answer) }}>{d.answer}</span>
        )}
        {d.barRange && <span style={{ fontSize: 10, color: '#9ca3af' }}>{d.barRange}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

function TerminalCard({ data }: NodeProps) {
  const d = data as TraceNodeData
  const color = terminalColor(d.outcome ?? '')
  return (
    <div
      style={{
        width: 264,
        background: '#fff',
        border: `2px solid ${color}`,
        borderRadius: 10,
        padding: 12,
        textAlign: 'center',
        boxShadow: `0 0 0 3px ${color}22`,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontWeight: 700, color, marginBottom: 4 }}>
        终点 · {d.outcome}
      </div>
      <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.4 }}>{d.label}</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { trace: TraceNodeCard, terminal: TerminalCard }

export function DecisionFlowViz({ gateTrace, decisionTrace, terminal }: Props) {
  const [tree, setTree] = useState<DecisionTreeStatic | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    api.decisionTree().then(setTree).catch(() => {})
  }, [])

  const merged = useMemo(() => mergeTraces(gateTrace, decisionTrace), [gateTrace, decisionTrace])
  const built = useMemo(() => buildFlow(merged, terminal, tree), [merged, terminal, tree])

  const selectedIndex = selected === 'terminal'
    ? merged.length
    : selected
      ? parseInt(selected.slice(1), 10)
      : -1

  const nodes = useMemo(
    () =>
      built.nodes.map((n, i) => ({
        ...n,
        style: {
          ...(n.style as object),
          opacity: selectedIndex >= 0 && i > selectedIndex ? 0.22 : 1,
          boxShadow: i === selectedIndex ? '0 0 0 2px #2563eb, 0 2px 6px rgba(37,99,235,0.3)' : undefined,
        },
      })),
    [built.nodes, selectedIndex],
  )
  const edges = useMemo(
    () =>
      built.edges.map((e, i) => ({
        ...e,
        animated: selectedIndex >= 0 && i < selectedIndex,
        style: {
          stroke: selectedIndex >= 0 && i >= selectedIndex ? '#d1d5db' : '#3b82f6',
          strokeWidth: 2,
        },
      })),
    [built.edges, selectedIndex],
  )

  if (merged.length === 0) {
    return <div className="dfv-empty">完成分析或载入历史记录后展示决策路径</div>
  }

  return (
    <div className="dfv-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => setSelected(selected === n.id ? null : (n.id as string))}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#e5e7eb" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable style={{ background: '#f9fafb' }} />
      </ReactFlow>
    </div>
  )
}
