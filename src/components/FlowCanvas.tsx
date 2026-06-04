import { useMemo, useEffect } from 'react'
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

  const layoutedNodes = useMemo(
    () => computeGridLayout(rawNodes, userSemesters),
    [rawNodes, userSemesters],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges)

  useEffect(() => {
    setNodes(layoutedNodes)
  }, [layoutedNodes, setNodes])

  useEffect(() => {
    setEdges(rawEdges)
  }, [rawEdges, setEdges])

  if (!planData) return null

  return (
    <div className="w-full h-full">
      <ReactFlow
        style={{ background: 'transparent' }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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
    </div>
  )
}
