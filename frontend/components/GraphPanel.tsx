"use client"

import { useEffect, useState, useCallback } from "react"
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RF = ReactFlow as any
import { api, type GraphDataResponse } from "@/lib/api"
import { severityColor } from "@/components/SeverityBadge"

// Simple circular layout — ego node in centre, peers arranged radially
function layoutNodes(rawNodes: GraphDataResponse["nodes"], egoId: string): Node[] {
  const ego = rawNodes.find(n => n.id === egoId)
  const peers = rawNodes.filter(n => n.id !== egoId)
  const R = 180
  const result: Node[] = []

  if (ego) {
    result.push({
      id: ego.id,
      position: { x: 0, y: 0 },
      data: { label: `u/${ego.data.label}` },
      style: nodeStyle(ego.data.severity, true),
    })
  }

  peers.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(peers.length, 1) - Math.PI / 2
    result.push({
      id: n.id,
      position: { x: R * Math.cos(angle), y: R * Math.sin(angle) },
      data: { label: `u/${n.data.label}` },
      style: nodeStyle(n.data.severity, false),
    })
  })

  return result
}

function nodeStyle(severity: string, isEgo: boolean) {
  return {
    background: severityColor(severity),
    color: "#fff",
    border: isEgo ? "3px solid rgba(255,255,255,0.5)" : "none",
    borderRadius: isEgo ? "50%" : "10px",
    fontWeight: 700,
    fontSize: isEgo ? 13 : 11,
    padding: isEgo ? "12px" : "8px 12px",
    width: isEgo ? 80 : undefined,
    height: isEgo ? 80 : undefined,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: isEgo ? `0 0 0 6px ${severityColor(severity)}30` : "none",
  }
}

export function GraphPanel({ userId }: { userId: string }) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data: GraphDataResponse = await api.graphData(userId)
      setNodes(layoutNodes(data.nodes, userId))
      setEdges(
        data.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          style: { strokeWidth: Math.max(1.5, e.data.weight * 2), stroke: "#9ca3af" },
          animated: true,
        }))
      )
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="h-96 flex items-center justify-center text-muted-foreground text-sm">Loading graph…</div>
  )
  if (error) return (
    <div className="h-96 flex items-center justify-center text-sm text-muted-foreground">{error}</div>
  )

  return (
    <div className="h-96 w-full rounded-xl overflow-hidden border">
      <RF nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.3 }}>
        <Background color="var(--border)" gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={(n: Node) => (n.style?.background as string) ?? "#6b7280"} maskColor="rgba(0,0,0,0.05)" />
      </RF>
      <div className="flex gap-4 p-3 border-t bg-muted/30 text-xs text-muted-foreground flex-wrap">
        {["Low", "Medium", "High", "Critical"].map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: severityColor(s) }} />
            {s}
          </span>
        ))}
        <span className="ml-auto italic">Centre node = you · Peers arranged radially</span>
      </div>
    </div>
  )
}
