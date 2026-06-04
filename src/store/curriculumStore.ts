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

      loadPlan: (filename) => {
        const planData = loadPlanData(filename)
        const userState: UserStateMap = {}

        for (const [id, course] of Object.entries(planData)) {
          userState[id] = {
            aprobada: false,
            planeada: false,
            semestrePlaneado: course.semestre,
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
            // Estaba aprobada → desaprobar ella y sus dependientes
            next = unapproveDescendants(courseId, planData, next)
          }
          next[courseId] = { ...next[courseId], planeada: true, aprobada: false }
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
          state.loadPlan(state.activePlan)
        }
      },
    },
  ),
)
