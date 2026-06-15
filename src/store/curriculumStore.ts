import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CurriculumState, UserStateMap } from '../types/store'
import { loadPlanData, programIndex } from '../data/loader'
import { approveWithAncestors } from '../algorithms/dfsApprove'
import { unapproveDescendants } from '../algorithms/unapproveDescendants'
import { validateTopology } from '../algorithms/topoValidate'

export const useCurriculumStore = create<CurriculumState>()(
  persist(
    (set, get) => ({
      activePlan: null,
      planData: null,
      programIndex,
      userState: {},
      validationErrors: [],
      showAvailable: false,

      loadPlan: (filename, existingUserState?) => {
        const planData = loadPlanData(filename)
        const userState: UserStateMap = {}

        for (const [id, course] of Object.entries(planData)) {
          userState[id] = {
            aprobada: existingUserState?.[id]?.aprobada ?? false,
            planeada: existingUserState?.[id]?.planeada ?? false,
            semestrePlaneado: existingUserState?.[id]?.semestrePlaneado ?? course.semestre,
          }
        }

        const validationErrors = validateTopology(planData, userState)
        set({ activePlan: filename, planData, userState, validationErrors })
      },

      toggleApproval: (courseId) => {
        const { planData, userState } = get()
        if (!planData) return
        const course = planData[courseId]
        if (!course) return

        const currentlyApproved = userState[courseId]?.aprobada ?? false
        let next = { ...userState }

        if (!currentlyApproved) {
          next = approveWithAncestors(courseId, planData, next)
          for (const partnerId of course.coreqGroup) {
            next = approveWithAncestors(partnerId, planData, next)
          }
          // Clear planned status for newly approved courses
          next[courseId] = { ...next[courseId], planeada: false }
          for (const partnerId of course.coreqGroup) {
            if (next[partnerId]) next[partnerId] = { ...next[partnerId], planeada: false }
          }
        } else {
          next[courseId] = { ...next[courseId], aprobada: false }
          for (const partnerId of course.coreqGroup) {
            if (next[partnerId]) {
              next[partnerId] = { ...next[partnerId], aprobada: false }
            }
          }
        }

        const validationErrors = validateTopology(planData, next)
        set({ userState: next, validationErrors })
      },

      togglePlanned: (courseId) => {
        const { planData, userState } = get()
        if (!planData) return
        const course = planData[courseId]
        if (!course) return
        const currentlyPlanned = userState[courseId]?.planeada ?? false
        const wasApproved = userState[courseId]?.aprobada ?? false

        if (currentlyPlanned) {
          // Ya estaba planeada → volver a neutral
          const next = {
            ...userState,
            [courseId]: { ...userState[courseId], planeada: false },
          }
          set({ userState: next })
        } else {
          // Marcar como planeada
          let next = { ...userState }
          if (wasApproved) {
            next = unapproveDescendants(courseId, planData, next)
          }

          // Auto-aprobar prerreqs de la materia principal
          for (const prereqId of course.prerreqs) {
            next = approveWithAncestors(prereqId, planData, next)
          }

          // Auto-aprobar prerreqs de cada correquisito
          for (const partnerId of course.coreqGroup) {
            const partner = planData[partnerId]
            if (partner) {
              for (const prereqId of partner.prerreqs) {
                next = approveWithAncestors(prereqId, planData, next)
              }
            }
          }

          // Invariante: aprobada XOR planeada (después de todas las aprobaciones)
          for (const id of Object.keys(next)) {
            if (next[id]?.aprobada && next[id]?.planeada) {
              next[id] = { ...next[id], planeada: false }
            }
          }

          next[courseId] = { ...next[courseId], planeada: true, aprobada: false }

          // Auto-planear correquisitos
          for (const partnerId of course.coreqGroup) {
            if (next[partnerId]) {
              next[partnerId] = { ...next[partnerId], planeada: true, aprobada: false }
            }
          }

          const validationErrors = validateTopology(planData, next)
          set({ userState: next, validationErrors })
        }
      },

      setPlannedSemester: (courseId, sem) => {
        const { planData, userState } = get()
        if (!planData) return
        const next = {
          ...userState,
          [courseId]: {
            ...(userState[courseId] ?? { aprobada: false, planeada: false }),
            semestrePlaneado: sem,
          },
        }
        const validationErrors = validateTopology(planData, next)
        set({ userState: next, validationErrors })
      },

      resetPlan: () => {
        const { activePlan } = get()
        if (activePlan) get().loadPlan(activePlan)
      },

      toggleShowAvailable: () => set((s) => ({ showAvailable: !s.showAvailable })),
    }),
    {
      name: 'grafitam-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activePlan: state.activePlan,
        userState: state.userState,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.activePlan && !state.planData) {
          state.loadPlan(state.activePlan, state.userState)
        }
      },
    },
  ),
)
