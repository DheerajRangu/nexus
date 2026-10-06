import { create } from "zustand";
import { emptyCity, type City } from "../services/ecosystem";
type State = {
  city: City;
  selected: string;
  focus: { kind: string; id: string } | null;
  layer: string;
  tab: string;
  leftOpen: boolean;
  rightOpen: boolean;
  setCity: (city: City) => void;
  select: (id: string) => void;
  setFocus: (kind: string, id: string) => void;
  setLayer: (layer: string) => void;
  setTab: (tab: string) => void;
  toggle: (side: "left" | "right") => void;
};
export const useCommandStore = create<State>((set) => ({
  city: emptyCity,
  selected: "",
  focus: null,
  layer: "NORMAL",
  tab: "Live Operations",
  leftOpen: true,
  rightOpen: true,
  setCity: (city) => set({ city }),
  select: (id) => set({ selected: id, focus: { kind: "incident", id } }),
  setFocus: (kind, id) => set({ focus: { kind, id } }),
  setLayer: (layer) => set({ layer }),
  setTab: (tab) => set({ tab }),
  toggle: (side) =>
    set((state) =>
      side === "left"
        ? { leftOpen: !state.leftOpen }
        : { rightOpen: !state.rightOpen },
    ),
}));
