# Especificación Técnica y Arquitectura: DAG-Plan (ITAM)

## 1. Stack Tecnológico y Entorno

* **Entorno de Desarrollo:** Vite para la compilación, ejecutado en entornos locales (VS Code o Cursor).
* **Framework Base:** React.js con TypeScript. El tipado estricto es obligatorio para garantizar la integridad de las interfaces `Node` y `Edge`.
* **Motor de Visualización:** React Flow (v11+). Abstracción de nodos y aristas. Renderizado reactivo en el DOM o Canvas según el volumen de elementos.
* **Motor de Layout:** `@dagrejs/dagre`. Calcula jerarquías espaciales automatizadas.
* **Gestor de Estado:** Zustand + `persist` middleware. Sincroniza la mutación del grafo con `LocalStorage` para garantizar la persistencia de datos sin base de datos.
* **Estilización:** Tailwind CSS. 

## 2. Directrices de Interfaz (UI/UX)

Para mantener una carga cognitiva baja frente a la densidad de información de un plan de estudios completo, la UI prescindirá de colores saturados.
* **Paleta:** Orgánica y minimalista (tonos café espresso y crema).
* **Implementación:** Nodos base en tonos crema (`#F5F5DC` o similares), texto en contraste oscuro, y el estado "Aprobado" definido mediante bordes o fondos sutilmente más oscuros (ej. espresso) sin recurrir a colores semánticos ruidosos (rojo/verde puro).

## 3. Estructura de Datos (JSON)

El grafo se alimentará de una estructura estática precargada. La separación entre `default_semester` (layout) y el estado del usuario garantiza la libertad de planeación.

```json
{
  "plan_id": "ITAM-DATA-2026",
  "total_credits_required": 350,
  "subjects": [
    {
      "id": "MAT-1101",
      "name": "Cálculo Diferencial",
      "credits": 6,
      "default_semester": 1,
      "prerequisites": []
    },
    {
      "id": "MAT-1102",
      "name": "Cálculo Integral",
      "credits": 6,
      "default_semester": 2,
      "prerequisites": ["MAT-1101"]
    }
  ]
}
```

## 4. Mecánica Algorítmica

El sistema requiere dos algoritmos fundamentales que se ejecutan en el cliente. La complejidad algorítmica se mantiene en **$O(V+E)$** donde **$V$** son los vértices (materias) y **$E$** las aristas (prerrequisitos).

### 4.1 Recorrido Inverso (Auto-completado de Prerrequisitos)

**El "Por qué":** Reducir la fricción. Si un usuario marca "Estadística Aplicada" como aprobada, es lógicamente imposible que no haya aprobado "Probabilidad".

**El "Cómo":** Se implementa una Búsqueda en Profundidad (DFS - Depth First Search).

1. Se define el grafo transpuesto **$G^T$**, invirtiendo la dirección de las aristas (los prerrequisitos apuntan hacia atrás).
2. Al activar un nodo **$v$**, el algoritmo itera recursivamente sobre el arreglo de `prerequisites` de **$v$**.
3. Si un prerrequisito **$u$** está en estado `aprobado == false`, muta su estado a `true` y llama a la función recursivamente pasando **$u$** como argumento.
4. La recursión se detiene cuando el nodo evaluado ya está marcado como aprobado o su arreglo de prerrequisitos está vacío.

### 4.2 Validación de Ordenamiento Topológico (Planeación)

**El "Por qué":** El usuario tiene libertad de asignar materias a cualquier semestre proyectado (1 a N). El sistema debe validar que esta asignación no viole la causalidad del tiempo.

**El "Cómo":** Cuando una materia **$v$** se asigna al `planned_semester = X`, el sistema verifica todas las aristas entrantes **$(u, v)$** donde **$u$** es un prerrequisito.

* **Regla Lógica:** Para todo **$u \in \text{prerequisites}(v)$**, debe cumplirse estrictamente que **$Semestre(u) < Semestre(v)$**.
* Si la regla se rompe (el usuario intenta cursar Cálculo Integral en el semestre 2, pero asignó Cálculo Diferencial al semestre 3), el estado de la arista se invalida, aplicando una clase Tailwind de error en el layout de React Flow, bloqueando la consolidación del plan.

## 5. Arquitectura de Despliegue

* Repositorio alojado en GitHub.
* Uso de GitHub Actions para interceptar los commits en la rama `main`.
* Ejecución de `npm run build` (Vite compila el TS y minimiza los assets estáticos).
* Despliegue automático de la carpeta `dist/` hacia GitHub Pages.
