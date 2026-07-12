import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCurriculumStore } from '../store/curriculumStore'
import { computeGridLayout } from '../algorithms/dagreLayout'
import { buildDependentsIndex, computeHoverHighlight, coreqEdgeId, prereqEdgeId } from '../algorithms/graphHighlight'
import CourseNode, { type CourseNodeData } from './CourseNode'
import PrereqEdge from './edges/PrereqEdge'
import CoreqEdge from './edges/CoreqEdge'
import ErrorEdge from './edges/ErrorEdge'
import EdgeMarkers from './edges/EdgeMarkers'
import type { Course } from '../types/curriculum'

const nodeTypes = { courseNode: CourseNode }
const edgeTypes = { prereqEdge: PrereqEdge, coreqEdge: CoreqEdge, errorEdge: ErrorEdge }

const EDGE_DIM_OPACITY = 0.12
const NODE_DIM_OPACITY = 0.3
const HOVER_GRACE_MS = 100

export default function FlowCanvas() {
  const planData = useCurriculumStore((s) => s.planData)
  const userState = useCurriculumStore((s) => s.userState)
  const validationErrors = useCurriculumStore((s) => s.validationErrors)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ courseId: string; x: number; y: number } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const errorSet = useMemo(
    () => new Set(validationErrors.map((e) => prereqEdgeId(e.prereqId, e.courseId))),
    [validationErrors],
  )

  const userSemesters = useMemo(() => {
    const map: Record<string, number> = {}
    if (!planData) return map
    for (const [id, course] of Object.entries(planData)) {
      map[id] = userState[id]?.semestrePlaneado ?? course.semestre
    }
    return map
  }, [planData, userState])

  const rawNodes: Node<CourseNodeData>[] = useMemo(() => {
    if (!planData) return []
    return Object.values(planData).map((course: Course) => ({
      id: course.id,
      type: 'courseNode',
      position: { x: 0, y: 0 },
      data: { course },
    }))
  }, [planData])

  const rawEdges: Edge[] = useMemo(() => {
    if (!planData) return []
    const edges: Edge[] = []

    for (const course of Object.values(planData)) {
      for (const prereqId of course.prerreqs) {
        const key = prereqEdgeId(prereqId, course.id)
        const isError = errorSet.has(key)
        const isSourceApproved = userState[prereqId]?.aprobada ?? false
        edges.push({
          id: key,
          source: prereqId,
          target: course.id,
          type: isError ? 'errorEdge' : 'prereqEdge',
          markerEnd: isError
            ? 'error-marker'
            : {
                type: MarkerType.ArrowClosed,
                color: isSourceApproved ? '#1E5E4B' : '#8CA699',
                width: 14,
                height: 14,
              },
        })
      }

      for (const partnerId of course.coreqGroup) {
        if (course.id < partnerId) {
          edges.push({
            id: coreqEdgeId(course.id, partnerId),
            source: course.id,
            target: partnerId,
            type: 'coreqEdge',
          })
        }
      }
    }

    return edges
  }, [planData, errorSet, userState])

  const dependentsIndex = useMemo(
    () => (planData ? buildDependentsIndex(planData) : {}),
    [planData],
  )

  const highlight = useMemo(
    () => (hoveredNodeId && planData ? computeHoverHighlight(hoveredNodeId, planData, dependentsIndex) : null),
    [hoveredNodeId, planData, dependentsIndex],
  )

  const displayEdges = useMemo(() => {
    if (!highlight) return rawEdges
    return rawEdges.map((edge) => ({
      ...edge,
      style: {
        ...(edge.style ?? {}),
        opacity: highlight.edgeIds.has(edge.id) ? 1 : EDGE_DIM_OPACITY,
      },
    }))
  }, [rawEdges, highlight])

  const layoutedNodes = useMemo(
    () => computeGridLayout(rawNodes, userSemesters),
    [rawNodes, userSemesters],
  )

  const displayNodes = useMemo(() => {
    if (!highlight) return layoutedNodes
    return layoutedNodes.map((node) => ({
      ...node,
      style: {
        ...(node.style ?? {}),
        opacity: highlight.nodeIds.has(node.id) ? 1 : NODE_DIM_OPACITY,
      },
    }))
  }, [layoutedNodes, highlight])

  const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges)

  useEffect(() => {
    setNodes(displayNodes)
  }, [displayNodes, setNodes])

  useEffect(() => {
    setEdges(displayEdges)
  }, [displayEdges, setEdges])

  const handleNodeMouseEnter = useCallback((event: React.MouseEvent, node: Node) => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current)
      hoverClearTimerRef.current = null
    }
    setHoveredNodeId(node.id)
    tooltipTimerRef.current = setTimeout(() => {
      setTooltip({ courseId: node.id, x: event.clientX, y: event.clientY })
    }, 800)
  }, [])

  const handleNodeMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    hoverClearTimerRef.current = setTimeout(() => {
      setHoveredNodeId(null)
      setTooltip(null)
    }, HOVER_GRACE_MS)
  }, [])

  if (!planData) return null

  return (
    <div className="w-full h-full" style={{ position: 'relative' }}>
      <EdgeMarkers />
      <ReactFlow
        style={{ background: 'transparent' }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background color="#DDD8D3" gap={24} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(n) =>
            (n.data as CourseNodeData).course &&
            userState[(n.data as CourseNodeData).course.id]?.aprobada
              ? '#1E5E4B'
              : '#FCFAF8'
          }
          maskColor="rgba(237,232,200,0.6)"
        />
      </ReactFlow>

      {tooltip && (() => {
        const course = planData[tooltip.courseId]
        if (!course) return null
        const prereqs = course.prerreqs.map((id) => ({
          id,
          nombre: planData[id]?.nombre ?? id,
          aprobada: userState[id]?.aprobada ?? false,
        }))
        const coreqs = course.coreqGroup.map((id) => planData[id]?.nombre ?? id)
        const blocked = Object.values(planData)
          .filter((c) => c.prerreqs.includes(tooltip.courseId))
          .map((c) => c.nombre)
        return (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x + 14,
              top: tooltip.y + 14,
              zIndex: 1000,
              maxWidth: 280,
              background: '#1A0F0A',
              color: '#F5F5DC',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>{course.nombre}</div>
            {prereqs.length > 0 && (
              <>
                <div style={{ opacity: 0.5, marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Prerrequisitos
                </div>
                {prereqs.map((p) => (
                  <div key={p.id} style={{ color: p.aprobada ? '#22C55E' : '#FCA5A5', marginBottom: 3 }}>
                    {p.aprobada ? '✓' : '✗'} {p.nombre}
                  </div>
                ))}
              </>
            )}
            {coreqs.length > 0 && (
              <>
                <div style={{ opacity: 0.5, marginTop: 10, marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Correquisitos
                </div>
                {coreqs.map((n, i) => (
                  <div key={i} style={{ marginBottom: 3 }}>↔ {n}</div>
                ))}
              </>
            )}
            {blocked.length > 0 && (
              <>
                <div style={{ opacity: 0.5, marginTop: 10, marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Desbloquea
                </div>
                {blocked.map((n, i) => (
                  <div key={i} style={{ marginBottom: 3 }}>→ {n}</div>
                ))}
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
