export const BEKIJKEN_ALS_OPSLAG_SLEUTEL = "fps.bekijkenAlsPersoon";

export function wisOpgeslagenBekijkenAls(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(BEKIJKEN_ALS_OPSLAG_SLEUTEL);
}