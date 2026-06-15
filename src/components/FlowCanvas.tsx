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
import CourseNode, { type CourseNodeData } from './CourseNode'
import PrereqEdge from './edges/PrereqEdge'
import CoreqEdge from './edges/CoreqEdge'
import ErrorEdge from './edges/ErrorEdge'
import type { Course } from '../types/curriculum'

const nodeTypes = { courseNode: CourseNode }
const edgeTypes = { prereqEdge: PrereqEdge, coreqEdge: CoreqEdge, errorEdge: ErrorEdge }

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, color: '#8CA699', width: 14, height: 14 },
}

export default function FlowCanvas() {
  const planData = useCurriculumStore((s) => s.planData)
  const userState = useCurriculumStore((s) => s.userState)
  const validationErrors = useCurriculumStore((s) => s.validationErrors)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ courseId: string; x: number; y: number } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const errorSet = useMemo(
    () => new Set(validationErrors.map((e) => `${e.prereqId}__${e.courseId}`)),
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
        const key = `${prereqId}__${course.id}`
        edges.push({
          id: key,
          source: prereqId,
          target: course.id,
          type: errorSet.has(key) ? 'errorEdge' : 'prereqEdge',
        })
      }

      for (const partnerId of course.coreqGroup) {
        if (course.id < partnerId) {
          edges.push({
            id: `coreq__${course.id}__${partnerId}`,
            source: course.id,
            target: partnerId,
            type: 'coreqEdge',
          })
        }
      }
    }

    return edges
  }, [planData, errorSet])

  const displayEdges = useMemo(() => {
    if (!hoveredNodeId) return rawEdges
    return rawEdges.map((edge) => ({
      ...edge,
      style: {
        ...(edge.style ?? {}),
        opacity:
          edge.source === hoveredNodeId || edge.target === hoveredNodeId ? 1 : 0.1,
      },
    }))
  }, [rawEdges, hoveredNodeId])

  const layoutedNodes = useMemo(
    () => computeGridLayout(rawNodes, userSemesters),
    [rawNodes, userSemesters],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges)

  useEffect(() => {
    setNodes(layoutedNodes)
  }, [layoutedNodes, setNodes])

  useEffect(() => {
    setEdges(displayEdges)
  }, [displayEdges, setEdges])

  const handleNodeMouseEnter = useCallback((event: React.MouseEvent, node: Node) => {
    setHoveredNodeId(node.id)
    tooltipTimerRef.current = setTimeout(() => {
      setTooltip({ courseId: node.id, x: event.clientX, y: event.clientY })
    }, 800)
  }, [])

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    setTooltip(null)
  }, [])

  if (!planData) return null

  return (
    <div className="w-full h-full" style={{ position: 'relative' }}>
      <ReactFlow
        style={{ background: 'transparent' }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
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
          </div>
        )
      })()}
    </div>
  )
}
