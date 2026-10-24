export type ExplorerSearch = {
  q: string;
  ville: string;
  cat: string;
  quand: string;
  tri: string;
  max: number;
  page: number;
  vip: string;
  instant: string;
  seated: string;
};

export function explorerSearch(partial: Partial<ExplorerSearch> = {}): ExplorerSearch {
  return {
    q: "",
    ville: "",
    cat: "",
    quand: "",
    tri: "popular",
    max: 2500,
    page: 1,
    vip: "",
    instant: "",
    seated: "",
    ...partial,
  };
}
