/** `<defs>` con el marcador custom de ErrorEdge (círculo + cruz tipo "estación", en vez
 * del triángulo estándar de xyflow). Se monta una sola vez como hermano de `<ReactFlow>`;
 * los `<marker>` SVG resuelven por id a nivel de documento, no necesitan vivir dentro del
 * mismo `<svg>` que las aristas. */
export default function EdgeMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <marker
          id="error-marker"
          viewBox="0 0 20 20"
          refX="10"
          refY="10"
          markerWidth="14"
          markerHeight="14"
          orient="auto-start-reverse"
        >
          <circle cx="10" cy="10" r="6" fill="none" stroke="#8C5E58" strokeWidth="2" />
          <line x1="10" y1="4" x2="10" y2="16" stroke="#8C5E58" strokeWidth="2" />
          <line x1="4" y1="10" x2="16" y2="10" stroke="#8C5E58" strokeWidth="2" />
        </marker>
      </defs>
    </svg>
  )
}
