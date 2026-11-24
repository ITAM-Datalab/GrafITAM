import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCurriculumStore } from '../store/curriculumStore'
import { computeGridLayout, COLUMN_GAP, NODE_WIDTH } from '../algorithms/dagreLayout'
import { buildDependentsIndex, computeHoverHighlight, coreqEdgeId, prereqEdgeId } from '../algorithms/graphHighlight'
import CourseNode, { type CourseNodeData } from './CourseNode'
import SemesterHeader, { SEMESTER_HEADER_PREFIX, type SemesterHeaderData } from './SemesterHeader'
import PrereqEdge from './edges/PrereqEdge'
import CoreqEdge from './edges/CoreqEdge'
import ErrorEdge from './edges/ErrorEdge'
import EdgeMarkers from './edges/EdgeMarkers'
import type { Course } from '../types/curriculum'

const nodeTypes = { courseNode: CourseNode, semesterHeader: SemesterHeader }
const edgeTypes = { prereqEdge: PrereqEdge, coreqEdge: CoreqEdge, errorEdge: ErrorEdge }

const EDGE_DIM_OPACITY = 0.35
const NODE_DIM_OPACITY = 0.55
const HOVER_GRACE_MS = 100
// Aristas de la cadena resaltada (ver PrereqEdge). La punta de flecha de xyflow escala con
// el grosor de la línea (markerUnits = strokeWidth), por eso su tamaño base es menor.
const HIGHLIGHT_EDGE_COLOR = '#0D3B2E'
const HIGHLIGHT_MARKER_SIZE = 10

export default function FlowCanvas() {
  const planData = useCurriculumStore((s) => s.planData)
  const userState = useCurriculumStore((s) => s.userState)
  const validationErrors = useCurriculumStore((s) => s.validationErrors)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  // Materia fijada con clic: su resaltado no se pierde al mover el mouse
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null)
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

  // Al cambiar de plan se suelta la materia fijada
  useEffect(() => {
    setPinnedNodeId(null)
  }, [planData])

  // La materia fijada manda; si no hay, se usa la del hover
  const activeNodeId = pinnedNodeId ?? hoveredNodeId
  const highlight = useMemo(
    () => (activeNodeId && planData ? computeHoverHighlight(activeNodeId, planData, dependentsIndex) : null),
    [activeNodeId, planData, dependentsIndex],
  )

  const displayEdges = useMemo(() => {
    if (!highlight) return rawEdges
    return rawEdges.map((edge) => {
      const isHighlighted = highlight.edgeIds.has(edge.id)
      return {
        ...edge,
        data: { ...(edge.data ?? {}), highlighted: isHighlighted },
        // La punta de flecha de una arista remarcada toma el mismo color que la línea
        markerEnd:
          isHighlighted && typeof edge.markerEnd === 'object'
            ? { ...edge.markerEnd, color: HIGHLIGHT_EDGE_COLOR, width: HIGHLIGHT_MARKER_SIZE, height: HIGHLIGHT_MARKER_SIZE }
            : edge.markerEnd,
        style: {
          ...(edge.style ?? {}),
          opacity: isHighlighted ? 1 : EDGE_DIM_OPACITY,
        },
      }
    })
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
        // Borde para que se note cuál materia está fijada
        ...(node.id === pinnedNodeId
          ? { outline: `2px solid ${HIGHLIGHT_EDGE_COLOR}`, outlineOffset: 2, borderRadius: 8 }
          : {}),
      },
    }))
  }, [layoutedNodes, highlight, pinnedNodeId])
  
    // Encabezado arriba de cada columna. Son nodos de solo lectura.
  const headerNodes: Node<SemesterHeaderData>[] = useMemo(() => {
    if (!planData) return []
    const stats: Record<number, { materias: number; creditos: number }> = {}
    for (const course of Object.values(planData)) {
      const sem = userSemesters[course.id] ?? course.semestre
      if (!stats[sem]) stats[sem] = { materias: 0, creditos: 0 }
      stats[sem].materias += 1
      stats[sem].creditos += course.creditos
    }
    return Object.entries(stats).map(([sem, { materias, creditos }]) => ({
      id: `${SEMESTER_HEADER_PREFIX}${sem}`,
      type: 'semesterHeader',
      position: { x: (Number(sem) - 1) * (NODE_WIDTH + COLUMN_GAP), y: -64 },
      data: { semestre: Number(sem), materias, creditos },
      draggable: false,
      selectable: false,
      connectable: false,
    }))
  }, [planData, userSemesters])
  const allNodes: Node[] = useMemo(() => [...headerNodes, ...displayNodes], [headerNodes, displayNodes])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(allNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges)

  useEffect(() => {
    setNodes(allNodes)
  }, [allNodes, setNodes])

  useEffect(() => {
    setEdges(displayEdges)
  }, [displayEdges, setEdges])

  const handleNodeMouseEnter = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.id.startsWith(SEMESTER_HEADER_PREFIX)) return
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

  // Clic en una materia: la fija, o la suelta si ya estaba fija. Los botones de la tarjeta
  // detienen el clic (CourseNode), así que marcar aprobada/planeada no la fija.
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.id.startsWith(SEMESTER_HEADER_PREFIX)) return
    setPinnedNodeId((current) => (current === node.id ? null : node.id))
  }, [])

  // Clic en el fondo vacío: suelta la materia fijada
  const handlePaneClick = useCallback(() => setPinnedNodeId(null), [])

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
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background color="#DDD8D3" gap={24} size={1} />
        <Controls showInteractive={false}/>
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
