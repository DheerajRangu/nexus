import { create } from "zustand";
import { emptyCity, type City } from "../services/ecosystem";
import type { HospitalOperations } from "../hospital/types";
type State = {
  city: City;
  operations: HospitalOperations | null;
  selected: string;
  tab: string;
  setSnapshot: (city: City, hid: string) => void;
  select: (id: string) => void;
  setTab: (tab: string) => void;
  clear: () => void;
};
export const useHospitalStore = create<State>((set) => ({
  city: emptyCity,
  operations: null,
  selected: "",
  tab: "Receiving",
  setSnapshot: (city, hid) =>
    set({
      city,
      operations:
        (
          city as City & {
            hospitalOperations?: Record<string, HospitalOperations>;
          }
        ).hospitalOperations?.[hid] || null,
    }),
  select: (selected) => set({ selected }),
  setTab: (tab) => set({ tab }),
  clear: () =>
    set({ city: emptyCity, operations: null, selected: "", tab: "Receiving" }),
}));
